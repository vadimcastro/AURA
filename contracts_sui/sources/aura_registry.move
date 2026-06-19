/// Module: aura_registry
///
/// On-chain reputation registry for AURA autonomous trading agents.
/// Agents stake SUI to register, earn reputation through recorded outcomes,
/// and can be slashed by the admin for protocol violations.
///
/// Reputation score formula: (successful_tasks / total_tasks) × 10^6
/// A score of 1_000_000 = 100% success rate.
///
/// Design:
///   • `Registry` is a shared singleton created once at package publish time.
///   • Each agent's record lives in a `Table<address, AgentRecord>`.
///   • Admin is the publisher address for hackathon; TODO Phase 6: replace with DAO.
///
/// TODO Phase 6: replace admin key with DAO/optimistic-slashing governance module.
module aura::aura_registry {
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};

    // ── Constants ─────────────────────────────────────────────────────────────

    /// Minimum SUI stake to register as an agent (0.01 SUI in MIST).
    /// Recalibrate for mainnet based on expected value at risk.
    const MIN_STAKE: u64 = 10_000_000;

    /// Dispute bond required to prevent griefing (0.1 SUI in MIST for Testnet).
    const DISPUTE_BOND_AMOUNT: u64 = 100_000_000;

    /// Reputation score denominator — 10^6 for precision without floats.
    const SCORE_PRECISION: u64 = 1_000_000;

    /// Bayesian prior for a brand-new, unproven agent.
    /// 500_000 = 50% — semantically "unknown" rather than "worst possible (0%)".
    /// The score converges toward actual performance after the first recorded task.
    /// Critical for Phase 3: any reputation-gated access would block new agents
    /// if they started at 0.
    const INITIAL_REPUTATION: u64 = 500_000;

    // ── Error codes ───────────────────────────────────────────────────────────

    const ENotAdmin: u64               = 0;
    const EAlreadyRegistered: u64      = 1;
    const ENotRegistered: u64          = 2;
    const EAgentInactive: u64          = 3;
    const EStakeTooLow: u64            = 4;
    const EAgentBlacklisted: u64       = 5; // Timed suspension — prevents trading AND stake escape
    const EDisputeNotFound: u64        = 6;
    const EDisputeAlreadyResolved: u64 = 7;
    const ENotAgentOperator: u64       = 8;
    const EDeadlineNotReached: u64     = 9;

    // ── Structs ───────────────────────────────────────────────────────────────

    /// Shared singleton registry. Created once by `initialize`.
    public struct Registry has key {
        id: UID,
        /// Admin address with slashing authority.
        /// TODO Phase 6: replace with a DAO capability object.
        admin: address,
        /// Map from agent address → AgentRecord.
        agents: Table<address, AgentRecord>,
        /// Map from dispute ID → Dispute.
        disputes: Table<ID, Dispute>,
    }

    /// Per-agent on-chain record.
    public struct AgentRecord has store {
        /// Locked SUI stake — returned on deregister, seized on slash.
        stake: Balance<SUI>,
        /// (successful_tasks / total_tasks) × 10^6; INITIAL_REPUTATION if no tasks recorded.
        reputation_score: u64,
        total_tasks: u64,
        successful_tasks: u64,
        /// Walrus blob_id of the latest archived audit trace (set by agent).
        walrus_history_blob: Option<vector<u8>>,
        /// False if slashed or deregistered.
        active: bool,
        /// Epoch until which the agent is blacklisted (0 = not blacklisted).
        /// A blacklisted agent cannot trade (assert_valid_agent aborts) and
        /// cannot deregister (closing the front-run-slash escape window).
        /// The admin calls blacklist_agent() to set this before slash_bond().
        blacklist_until: u64,
    }

    /// Dispute record representing a telemetry audit challenge.
    public struct Dispute has key, store {
        id: UID,
        agent: address,
        disputer: address,
        dispute_bond: Balance<SUI>,
        blob_id: vector<u8>,
        disclose_deadline: u64,
        resolved: bool,
        decryption_key: Option<vector<u8>>,
    }

    // ── Events ────────────────────────────────────────────────────────────────

    public struct RegistryInitialized has copy, drop {
        registry_id: ID,
        admin: address,
    }

    public struct AgentRegistered has copy, drop {
        agent: address,
        stake_amount: u64,
    }

    public struct TaskRecorded has copy, drop {
        agent: address,
        success: bool,
        total_tasks: u64,
        successful_tasks: u64,
        reputation_score: u64,
    }

    public struct WalrusHistoryUpdated has copy, drop {
        agent: address,
        blob_id: vector<u8>,
    }

    public struct AgentSlashed has copy, drop {
        agent: address,
        slashed_amount: u64,
        admin: address,
    }

    public struct AgentDeregistered has copy, drop {
        agent: address,
        stake_returned: u64,
    }

    /// Emitted when admin issues a timed suspension.
    public struct AgentBlacklisted has copy, drop {
        agent: address,
        until_epoch: u64,
    }

    /// Emitted when a user submits a dispute.
    public struct DisputeSubmitted has copy, drop {
        dispute_id: ID,
        agent: address,
        disputer: address,
        blob_id: vector<u8>,
        disclose_deadline: u64,
    }

    /// Emitted when an agent operator discloses the decryption key.
    public struct KeyDisclosed has copy, drop {
        dispute_id: ID,
        agent: address,
        decryption_key: vector<u8>,
    }

    /// Emitted when a dispute is resolved.
    public struct DisputeResolved has copy, drop {
        dispute_id: ID,
        agent: address,
        disputer: address,
        slashed: bool,
        slashed_amount: u64,
    }

    // ── Initialization ────────────────────────────────────────────────────────

    /// Called once on package publish via `init`.
    /// Creates and shares the Registry singleton.
    fun init(ctx: &mut TxContext) {
        let id = object::new(ctx);
        let registry_id = object::uid_to_inner(&id);
        let admin = ctx.sender();

        let registry = Registry {
            id,
            admin,
            agents: table::new(ctx),
            disputes: table::new(ctx),
        };

        event::emit(RegistryInitialized { registry_id, admin });

        transfer::share_object(registry);
    }

    // ── Public entry functions ────────────────────────────────────────────────

    /// Register a new agent by locking a SUI stake.
    /// The caller (agent's hot-key address) must not already be registered.
    public fun register_agent(
        registry: &mut Registry,
        stake_coin: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let agent_addr = ctx.sender();
        assert!(!table::contains(&registry.agents, agent_addr), EAlreadyRegistered);
        assert!(stake_coin.value() >= MIN_STAKE, EStakeTooLow);

        let stake_amount = stake_coin.value();

        let record = AgentRecord {
            stake: stake_coin.into_balance(),
            reputation_score: INITIAL_REPUTATION,
            total_tasks: 0,
            successful_tasks: 0,
            walrus_history_blob: option::none(),
            active: true,
            blacklist_until: 0,  // 0 = not blacklisted; any epoch satisfies >= 0
        };

        table::add(&mut registry.agents, agent_addr, record);

        event::emit(AgentRegistered { agent: agent_addr, stake_amount });
    }

    /// Pure assertion — aborts if the agent is not registered, active, or is blacklisted.
    /// Designed to be composed into PTBs as the first step before `borrow_for_trade`.
    ///
    /// Blacklist check uses ctx epoch so it's enforced on-chain at execution time.
    /// A blacklisted agent cannot borrow funds even if technically active.
    public fun assert_valid_agent(registry: &Registry, agent_addr: address, ctx: &TxContext) {
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);
        let record = table::borrow(&registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);
        assert!(ctx.epoch() >= record.blacklist_until, EAgentBlacklisted);
        assert!(balance::value(&record.stake) >= MIN_STAKE, EStakeTooLow);
    }

    /// Record the outcome of a completed task and recompute reputation score.
    /// Called by the trading agent after each trade cycle.
    public fun record_task_outcome(
        registry: &mut Registry,
        agent_addr: address,
        success: bool,
        _ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);
        let record = table::borrow_mut(&mut registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);

        record.total_tasks = record.total_tasks + 1;
        if (success) {
            record.successful_tasks = record.successful_tasks + 1;
        };

        // Recalculate: (successful / total) × 10^6
        record.reputation_score =
            (record.successful_tasks * SCORE_PRECISION) / record.total_tasks;

        event::emit(TaskRecorded {
            agent: agent_addr,
            success,
            total_tasks: record.total_tasks,
            successful_tasks: record.successful_tasks,
            reputation_score: record.reputation_score,
        });
    }

    /// Agent self-reports the latest Walrus audit blob_id.
    /// Commits the verifiable audit trail reference on-chain.
    public fun update_walrus_history(
        registry: &mut Registry,
        blob_id: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let agent_addr = ctx.sender();
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);
        let record = table::borrow_mut(&mut registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);

        record.walrus_history_blob = option::some(blob_id);

        event::emit(WalrusHistoryUpdated {
            agent: agent_addr,
            blob_id: *option::borrow(&record.walrus_history_blob),
        });
    }

    /// Admin-only: issue a timed suspension against an agent.
    ///
    /// Security rationale: closes the front-run-slash escape window.
    /// Without this, an agent watching the mempool can call `deregister_agent`
    /// before `slash_bond` lands, reclaiming their stake before it can be seized.
    /// Blacklisting prevents both trading AND deregistration during the window,
    /// giving the admin a safe investigation period before committing to slash.
    ///
    /// Typical workflow:
    ///   1. Admin calls blacklist_agent(agent, current_epoch + N)
    ///   2. Admin investigates off-chain
    ///   3a. Innocent: blacklist expires naturally, agent resumes
    ///   3b. Guilty:   admin calls slash_bond (agent cannot escape while blacklisted)
    public fun blacklist_agent(
        registry: &mut Registry,
        agent_addr: address,
        until_epoch: u64,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);
        let record = table::borrow_mut(&mut registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);
        record.blacklist_until = until_epoch;
        event::emit(AgentBlacklisted { agent: agent_addr, until_epoch });
    }

    /// Admin-only: slash an agent's bond and mark them inactive.
    /// Slashed stake is transferred to the admin address.
    /// TODO Phase 6: replace with optimistic dispute game — admin key removed.
    public fun slash_bond(
        registry: &mut Registry,
        agent_addr: address,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == registry.admin, ENotAdmin);
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);

        let record = table::borrow_mut(&mut registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);

        let slashed_amount = balance::value(&record.stake);
        let slashed_balance = balance::withdraw_all(&mut record.stake);
        record.active = false;
        record.reputation_score = 0;

        let slashed_coin = coin::from_balance(slashed_balance, ctx);

        event::emit(AgentSlashed {
            agent: agent_addr,
            slashed_amount,
            admin: registry.admin,
        });

        transfer::public_transfer(slashed_coin, registry.admin);
    }

    // Agent self-deregistration — reclaims remaining stake and marks inactive.
    // Guards:
    //   • Must be active (not already slashed/deregistered)
    //   • Must NOT be in blacklist window — prevents stake escape before admin can slash
    // Self-transfer is intentional here: the agent reclaims their own stake.
    #[allow(lint(self_transfer))]
    public fun deregister_agent(
        registry: &mut Registry,
        ctx: &mut TxContext,
    ) {
        let agent_addr = ctx.sender();
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);

        let record = table::borrow_mut(&mut registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);
        // Blacklist guard: cannot deregister during suspension window.
        // This closes the front-run-slash escape path.
        assert!(ctx.epoch() >= record.blacklist_until, EAgentBlacklisted);

        let stake_returned = balance::value(&record.stake);
        let stake_balance = balance::withdraw_all(&mut record.stake);
        record.active = false;

        let stake_coin = coin::from_balance(stake_balance, ctx);

        event::emit(AgentDeregistered { agent: agent_addr, stake_returned });

        transfer::public_transfer(stake_coin, agent_addr);
    }

    /// Submit a dispute challenging an agent's telemetry audit blob.
    /// Locks a 1.0 SUI dispute bond to prevent griefing.
    public fun submit_dispute(
        registry: &mut Registry,
        clock: &Clock,
        agent_addr: address,
        blob_id: vector<u8>,
        bond_coin: Coin<SUI>,
        ctx: &mut TxContext,
    ): ID {
        // Assert agent is registered and active
        assert!(table::contains(&registry.agents, agent_addr), ENotRegistered);
        let record = table::borrow(&registry.agents, agent_addr);
        assert!(record.active, EAgentInactive);

        // Enforce locked dispute bond is sufficient (1.0 SUI)
        let bond_value = bond_coin.value();
        assert!(bond_value >= DISPUTE_BOND_AMOUNT, EStakeTooLow);

        // Take exactly the dispute bond amount, return any remainder to disputer
        let mut bond_coin = bond_coin;
        let dispute_bond_balance = if (bond_value > DISPUTE_BOND_AMOUNT) {
            let split_coin = coin::split(&mut bond_coin, DISPUTE_BOND_AMOUNT, ctx);
            transfer::public_transfer(bond_coin, ctx.sender());
            coin::into_balance(split_coin)
        } else {
            coin::into_balance(bond_coin)
        };

        let dispute_uid = object::new(ctx);
        let dispute_id = object::uid_to_inner(&dispute_uid);
        let disputer = ctx.sender();
        let disclose_deadline = clock::timestamp_ms(clock) + 86_400_000; // 24-hour challenge window

        let dispute = Dispute {
            id: dispute_uid,
            agent: agent_addr,
            disputer,
            dispute_bond: dispute_bond_balance,
            blob_id,
            disclose_deadline,
            resolved: false,
            decryption_key: option::none(),
        };

        table::add(&mut registry.disputes, dispute_id, dispute);

        event::emit(DisputeSubmitted {
            dispute_id,
            agent: agent_addr,
            disputer,
            blob_id,
            disclose_deadline,
        });

        dispute_id
    }

    /// Disclose the decryption key for the disputed telemetry trace.
    /// Only the target agent operator can call this.
    /// Proves compliance, returns the dispute bond to the disputer, and keeps the agent un-slashed.
    public fun disclose_telemetry_key(
        registry: &mut Registry,
        dispute_id: ID,
        decryption_key: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow_mut(&mut registry.disputes, dispute_id);
        assert!(!dispute.resolved, EDisputeAlreadyResolved);

        // Enforce that only the target agent's operator address can call this.
        assert!(ctx.sender() == dispute.agent, ENotAgentOperator);

        dispute.decryption_key = option::some(decryption_key);
        dispute.resolved = true;

        // Refund the disputer's locked bond coin back to them
        let bond_balance = balance::withdraw_all(&mut dispute.dispute_bond);
        let bond_coin = coin::from_balance(bond_balance, ctx);
        transfer::public_transfer(bond_coin, dispute.disputer);

        event::emit(KeyDisclosed {
            dispute_id,
            agent: dispute.agent,
            decryption_key,
        });

        event::emit(DisputeResolved {
            dispute_id,
            agent: dispute.agent,
            disputer: dispute.disputer,
            slashed: false,
            slashed_amount: 0,
        });
    }

    /// Resolve a dispute after the deadline.
    /// Slashes the agent's bond and awards it to the disputer if the operator failed to disclose the key.
    public fun resolve_dispute(
        registry: &mut Registry,
        clock: &Clock,
        dispute_id: ID,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow_mut(&mut registry.disputes, dispute_id);
        assert!(!dispute.resolved, EDisputeAlreadyResolved);

        // Enforce disclosure deadline has passed
        assert!(clock::timestamp_ms(clock) > dispute.disclose_deadline, EDeadlineNotReached);

        dispute.resolved = true;

        // Retrieve agent's record and slash them
        let agent_record = table::borrow_mut(&mut registry.agents, dispute.agent);
        let slashed_amount = balance::value(&agent_record.stake);

        // Mark agent as inactive and reset reputation score
        agent_record.active = false;
        agent_record.reputation_score = 0;

        // Withdraw and award the agent's stake to the disputer
        let slashed_balance = balance::withdraw_all(&mut agent_record.stake);
        let slashed_coin = coin::from_balance(slashed_balance, ctx);
        transfer::public_transfer(slashed_coin, dispute.disputer);

        // Refund the disputer's own locked bond coin back to them as they were correct
        let bond_balance = balance::withdraw_all(&mut dispute.dispute_bond);
        let bond_coin = coin::from_balance(bond_balance, ctx);
        transfer::public_transfer(bond_coin, dispute.disputer);

        event::emit(DisputeResolved {
            dispute_id,
            agent: dispute.agent,
            disputer: dispute.disputer,
            slashed: true,
            slashed_amount,
        });
    }

    // ── Dispute View helpers ──────────────────────────────────────────────────

    public fun is_dispute_resolved(registry: &Registry, dispute_id: ID): bool {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow(&registry.disputes, dispute_id);
        dispute.resolved
    }

    public fun get_disclose_deadline(registry: &Registry, dispute_id: ID): u64 {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow(&registry.disputes, dispute_id);
        dispute.disclose_deadline
    }

    public fun get_dispute_bond_amount(registry: &Registry, dispute_id: ID): u64 {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow(&registry.disputes, dispute_id);
        balance::value(&dispute.dispute_bond)
    }

    public fun get_dispute_decryption_key(registry: &Registry, dispute_id: ID): Option<vector<u8>> {
        assert!(table::contains(&registry.disputes, dispute_id), EDisputeNotFound);
        let dispute = table::borrow(&registry.disputes, dispute_id);
        dispute.decryption_key
    }

    // ── View helpers ──────────────────────────────────────────────────────────

    public fun get_reputation_score(registry: &Registry, agent_addr: address): u64 {
        let record = table::borrow(&registry.agents, agent_addr);
        record.reputation_score
    }

    public fun get_stake_amount(registry: &Registry, agent_addr: address): u64 {
        let record = table::borrow(&registry.agents, agent_addr);
        balance::value(&record.stake)
    }

    public fun is_agent_active(registry: &Registry, agent_addr: address): bool {
        if (!table::contains(&registry.agents, agent_addr)) { return false };
        table::borrow(&registry.agents, agent_addr).active
    }

    public fun get_blacklist_until(registry: &Registry, agent_addr: address): u64 {
        if (!table::contains(&registry.agents, agent_addr)) { return 0 };
        table::borrow(&registry.agents, agent_addr).blacklist_until
    }

    // ── Test-only helpers ─────────────────────────────────────────────────────

    #[test_only]
    public fun get_total_tasks(registry: &Registry, agent_addr: address): u64 {
        table::borrow(&registry.agents, agent_addr).total_tasks
    }

    #[test_only]
    public fun get_successful_tasks(registry: &Registry, agent_addr: address): u64 {
        table::borrow(&registry.agents, agent_addr).successful_tasks
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    // ── Unit Tests ────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario::{Self as ts};

    #[test_only]
    const ADMIN: address  = @0xAD;
    #[test_only]
    const AGENT1: address = @0xA1;
    #[test_only]
    const STRANGER: address = @0xFFFF;

    // 4.10 — Agent registers successfully: stake locked, active, initial reputation = 50%.
    #[test]
    fun test_register_agent() {
        let mut scenario = ts::begin(ADMIN);
        {
            init_for_testing(ts::ctx(&mut scenario));
        };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            std::unit_test::assert_eq!(get_stake_amount(&registry, AGENT1), MIN_STAKE);
            assert!(is_agent_active(&registry, AGENT1), 0);
            // New agents start at 50% neutral — not 0% ("worst possible").
            std::unit_test::assert_eq!(get_reputation_score(&registry, AGENT1), INITIAL_REPUTATION);
            // No blacklist on fresh registration.
            std::unit_test::assert_eq!(get_blacklist_until(&registry, AGENT1), 0);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.11 — Reputation score calculation: 100%, 50%, 0%.
    #[test]
    fun test_reputation_score_calculation() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Record 2 successes → 100%
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            record_task_outcome(&mut registry, AGENT1, true, ctx);
            record_task_outcome(&mut registry, AGENT1, true, ctx);
            std::unit_test::assert_eq!(get_reputation_score(&registry, AGENT1), 1_000_000); // 100%
            ts::return_shared(registry);
        };

        // Record 2 failures → 50%
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            record_task_outcome(&mut registry, AGENT1, false, ctx);
            record_task_outcome(&mut registry, AGENT1, false, ctx);
            // 2 successes / 4 total = 500_000
            std::unit_test::assert_eq!(get_reputation_score(&registry, AGENT1), 500_000);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.12 — Admin slash extracts stake and marks agent inactive.
    #[test]
    fun test_slash_bond() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            slash_bond(&mut registry, AGENT1, ctx);
            assert!(!is_agent_active(&registry, AGENT1), 0);
            std::unit_test::assert_eq!(get_stake_amount(&registry, AGENT1), 0);
            ts::return_shared(registry);
        };

        // Admin receives slashed coin.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let slashed = ts::take_from_sender<Coin<SUI>>(&scenario);
            std::unit_test::assert_eq!(slashed.value(), MIN_STAKE);
            ts::return_to_sender(&scenario, slashed);
        };

        ts::end(scenario);
    }

    // 4.13 — Non-admin calling slash_bond must abort.
    #[test]
    #[expected_failure(abort_code = ENotAdmin)]
    fun test_slash_non_admin_aborts() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            slash_bond(&mut registry, AGENT1, ctx);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.14 — Agent self-deregistration reclaims full stake.
    #[test]
    fun test_deregister_reclaims_stake() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            deregister_agent(&mut registry, ctx);
            assert!(!is_agent_active(&registry, AGENT1), 0);
            ts::return_shared(registry);
        };

        // Agent receives stake back.
        ts::next_tx(&mut scenario, AGENT1);
        {
            let returned_stake = ts::take_from_sender<Coin<SUI>>(&scenario);
            std::unit_test::assert_eq!(returned_stake.value(), MIN_STAKE);
            ts::return_to_sender(&scenario, returned_stake);
        };

        ts::end(scenario);
    }

    // 4.15 — assert_valid_agent rejects a slashed (inactive) agent.
    #[test]
    #[expected_failure(abort_code = EAgentInactive)]
    fun test_assert_valid_agent_rejects_inactive() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            slash_bond(&mut registry, AGENT1, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Should abort with EAgentInactive.
            assert_valid_agent(&registry, AGENT1, ctx);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.16 — Blacklisted agent cannot pass assert_valid_agent.
    #[test]
    #[expected_failure(abort_code = EAgentBlacklisted)]
    fun test_blacklist_blocks_trading() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Admin blacklists agent until epoch 999.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            blacklist_agent(&mut registry, AGENT1, 999, ctx);
            std::unit_test::assert_eq!(get_blacklist_until(&registry, AGENT1), 999);
            ts::return_shared(registry);
        };

        // assert_valid_agent should abort with EAgentBlacklisted (current epoch << 999).
        ts::next_tx(&mut scenario, AGENT1);
        {
            let registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            assert_valid_agent(&registry, AGENT1, ctx);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.17 — Blacklisted agent cannot deregister (closes front-run-slash escape window).
    #[test]
    #[expected_failure(abort_code = EAgentBlacklisted)]
    fun test_blacklist_prevents_deregister() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            blacklist_agent(&mut registry, AGENT1, 999, ctx);
            ts::return_shared(registry);
        };

        // Agent tries to escape before slash — must abort.
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            deregister_agent(&mut registry, ctx);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 4.18 — Non-admin cannot blacklist.
    #[test]
    #[expected_failure(abort_code = ENotAdmin)]
    fun test_blacklist_non_admin_aborts() {
        let mut scenario = ts::begin(ADMIN);
        { init_for_testing(ts::ctx(&mut scenario)); };

        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            blacklist_agent(&mut registry, AGENT1, 999, ctx);
            ts::return_shared(registry);
        };

        ts::end(scenario);
    }

    // 7.5 — Dispute and successful disclosure test
    #[test]
    fun test_dispute_and_successful_disclosure() {
        let mut scenario = ts::begin(ADMIN);
        let disputer = @0xD1;
        { init_for_testing(ts::ctx(&mut scenario)); };

        // Register agent
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Create dispute with 1.0 SUI bond
        let mut dispute_id = object::id_from_address(@0x0);
        ts::next_tx(&mut scenario, disputer);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let bond = coin::mint_for_testing<SUI>(DISPUTE_BOND_AMOUNT, ctx);
            let clock = clock::create_for_testing(ctx);
            let blob_id = b"mock-blob-id-123";

            dispute_id = submit_dispute(&mut registry, &clock, AGENT1, blob_id, bond, ctx);

            // Assert dispute is registered and not resolved
            assert!(!is_dispute_resolved(&registry, dispute_id), 0);
            std::unit_test::assert_eq!(get_dispute_bond_amount(&registry, dispute_id), DISPUTE_BOND_AMOUNT);

            ts::return_shared(registry);
            clock::destroy_for_testing(clock);
        };

        // Operator discloses decryption key before deadline
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let decryption_key = b"super-secret-key-123";

            disclose_telemetry_key(&mut registry, dispute_id, decryption_key, ctx);

            // Assert dispute is resolved and key is stored
            assert!(is_dispute_resolved(&registry, dispute_id), 0);
            let stored_key_opt = get_dispute_decryption_key(&registry, dispute_id);
            assert!(option::is_some(&stored_key_opt), 0);
            std::unit_test::assert_eq!(*option::borrow(&stored_key_opt), decryption_key);

            // Assert agent remains active and has their stake intact
            assert!(is_agent_active(&registry, AGENT1), 0);
            std::unit_test::assert_eq!(get_stake_amount(&registry, AGENT1), MIN_STAKE);

            ts::return_shared(registry);
        };

        // Assert disputer gets their dispute bond refunded
        ts::next_tx(&mut scenario, disputer);
        {
            let refunded = ts::take_from_sender<Coin<SUI>>(&scenario);
            std::unit_test::assert_eq!(refunded.value(), DISPUTE_BOND_AMOUNT);
            ts::return_to_sender(&scenario, refunded);
        };

        ts::end(scenario);
    }

    // 7.6 — Dispute and slash on timeout test
    #[test]
    fun test_dispute_and_slash_on_timeout() {
        let mut scenario = ts::begin(ADMIN);
        let disputer = @0xD1;
        { init_for_testing(ts::ctx(&mut scenario)); };

        // Register agent
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Create dispute with 1.0 SUI bond
        let mut dispute_id = object::id_from_address(@0x0);
        ts::next_tx(&mut scenario, disputer);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let bond = coin::mint_for_testing<SUI>(DISPUTE_BOND_AMOUNT, ctx);
            let clock = clock::create_for_testing(ctx);
            let blob_id = b"mock-blob-id-123";

            dispute_id = submit_dispute(&mut registry, &clock, AGENT1, blob_id, bond, ctx);

            ts::return_shared(registry);
            clock::destroy_for_testing(clock);
        };

        // Resolve dispute after 24 hours has passed (deadline is +86_400_000 ms)
        ts::next_tx(&mut scenario, disputer);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let mut clock = clock::create_for_testing(ctx);

            // Increment clock past deadline (e.g. 86_500_000 ms)
            clock::increment_for_testing(&mut clock, 86_500_000);

            resolve_dispute(&mut registry, &clock, dispute_id, ctx);

            // Assert dispute is resolved
            assert!(is_dispute_resolved(&registry, dispute_id), 0);

            // Assert agent is marked inactive (slashed) and reputation is 0
            assert!(!is_agent_active(&registry, AGENT1), 0);
            std::unit_test::assert_eq!(get_reputation_score(&registry, AGENT1), 0);
            std::unit_test::assert_eq!(get_stake_amount(&registry, AGENT1), 0);

            ts::return_shared(registry);
            clock::destroy_for_testing(clock);
        };

        // Assert disputer receives the agent's slashed stake (MIN_STAKE) AND their dispute bond back (DISPUTE_BOND_AMOUNT)
        ts::next_tx(&mut scenario, disputer);
        {
            // Slashed coin (MIN_STAKE)
            let slashed_stake = ts::take_from_sender<Coin<SUI>>(&scenario);
            // Refunded bond (DISPUTE_BOND_AMOUNT)
            let refunded_bond = ts::take_from_sender<Coin<SUI>>(&scenario);

            let v1 = slashed_stake.value();
            let v2 = refunded_bond.value();

            assert!((v1 == MIN_STAKE && v2 == DISPUTE_BOND_AMOUNT) || (v1 == DISPUTE_BOND_AMOUNT && v2 == MIN_STAKE), 0);

            ts::return_to_sender(&scenario, slashed_stake);
            ts::return_to_sender(&scenario, refunded_bond);
        };

        ts::end(scenario);
    }

    // 7.7 — Griefing resistance dispute bond lock test
    #[test]
    #[expected_failure(abort_code = EStakeTooLow)]
    fun test_griefing_resistance_bond_lock() {
        let mut scenario = ts::begin(ADMIN);
        let disputer = @0xD1;
        { init_for_testing(ts::ctx(&mut scenario)); };

        // Register agent
        ts::next_tx(&mut scenario, AGENT1);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let stake = coin::mint_for_testing<SUI>(MIN_STAKE, ctx);
            register_agent(&mut registry, stake, ctx);
            ts::return_shared(registry);
        };

        // Try to submit dispute with insufficient bond (e.g. 0.5 SUI)
        ts::next_tx(&mut scenario, disputer);
        {
            let mut registry = ts::take_shared<Registry>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let bond = coin::mint_for_testing<SUI>(DISPUTE_BOND_AMOUNT / 2, ctx);
            let clock = clock::create_for_testing(ctx);
            let blob_id = b"mock-blob-id-123";

            // Should abort with EStakeTooLow because dispute bond is insufficient
            submit_dispute(&mut registry, &clock, AGENT1, blob_id, bond, ctx);

            ts::return_shared(registry);
            clock::destroy_for_testing(clock);
        };

        ts::end(scenario);
    }
}
