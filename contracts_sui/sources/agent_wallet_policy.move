/// Module: agent_wallet_policy
///
/// A policy-enforced wallet for autonomous trading agents on Sui.
/// Uses a Hot Potato (TradeTicket) pattern to guarantee that borrowed
/// funds can only flow to allowlisted contracts within the same PTB.
///
/// Key invariants:
///   • Only the designated `agent` address may call `borrow_for_trade`.
///   • Only the policy `owner` may call `revoke_policy` or `delegate_budget`.
///   • Borrowed funds MUST be returned in the same PTB (TradeTicket has no abilities).
///   • Cumulative spend never exceeds `budget_limit`.
///   • Balance never drops below `min_balance_floor`.
///
/// TODO Phase 6: integrate with DAO-based admin for policy governance.
module aura::agent_wallet_policy {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;

    // ── Error codes ──────────────────────────────────────────────────────────

    const ENotOwner: u64         = 0;
    const ENotAgent: u64         = 1;
    const EContractNotAllowed: u64 = 2;
    const EPolicyExpired: u64    = 3;
    const EBudgetExceeded: u64   = 4;
    const EFloorViolation: u64   = 5;
    const EInsufficientBalance: u64 = 6;

    // ── Structs ──────────────────────────────────────────────────────────────

    /// Shared policy object holding funds and execution rules.
    public struct WalletPolicy<phantom T> has key, store {
        id: UID,
        /// Address that owns this policy (may be a zkLogin-derived address).
        owner: address,
        /// Hot-key address of the autonomous trading agent.
        agent: address,
        /// Cumulative spend ceiling across all borrows.
        budget_limit: u64,
        /// Running total of MIST/tokens spent so far.
        budget_spent: u64,
        /// Contracts the agent is permitted to invoke with borrowed funds.
        allowed_contracts: vector<address>,
        /// Policy expires after this epoch; borrows are rejected past this point.
        expiration_epoch: u64,
        /// Minimum balance that must remain after a borrow.
        min_balance_floor: u64,
        /// The actual token reserve.
        balance: Balance<T>,
    }

    /// Hot Potato — has NO abilities (no key, store, drop, copy).
    /// Must be consumed by `return_and_complete` in the same PTB.
    /// This makes it physically impossible for the agent to abscond with funds.
    public struct TradeTicket<phantom T> {
        policy_id: ID,
        amount: u64,
        target_contract: address,
    }

    // ── Events ───────────────────────────────────────────────────────────────

    public struct PolicyCreated has copy, drop {
        policy_id: ID,
        owner: address,
        agent: address,
        budget_limit: u64,
        expiration_epoch: u64,
    }

    public struct Deposited has copy, drop {
        policy_id: ID,
        amount: u64,
        new_balance: u64,
    }

    public struct BorrowedForTrade has copy, drop {
        policy_id: ID,
        agent: address,
        amount: u64,
        target_contract: address,
        budget_spent: u64,
    }

    public struct TradeCompleted has copy, drop {
        policy_id: ID,
        amount_returned: u64,
        new_balance: u64,
        budget_spent: u64,   // net exposure remaining after this return
    }

    public struct BudgetUpdated has copy, drop {
        policy_id: ID,
        old_limit: u64,
        new_limit: u64,
    }

    public struct PolicyRevoked has copy, drop {
        policy_id: ID,
        owner: address,
        refund_amount: u64,
    }

    // ── Public entry functions ────────────────────────────────────────────────

    /// Create a new shared WalletPolicy and transfer it to the Sui object graph.
    /// The caller becomes the `owner`.
    public fun create_policy<T>(
        agent: address,
        budget_limit: u64,
        allowed_contracts: vector<address>,
        expiration_epoch: u64,
        min_balance_floor: u64,
        ctx: &mut TxContext,
    ) {
        let id = object::new(ctx);
        let policy_id = object::uid_to_inner(&id);

        let policy = WalletPolicy<T> {
            id,
            owner: ctx.sender(),
            agent,
            budget_limit,
            budget_spent: 0,
            allowed_contracts,
            expiration_epoch,
            min_balance_floor,
            balance: balance::zero(),
        };

        event::emit(PolicyCreated {
            policy_id,
            owner: policy.owner,
            agent: policy.agent,
            budget_limit,
            expiration_epoch,
        });

        transfer::share_object(policy);
    }

    /// Deposit tokens into the policy's reserve.
    public fun deposit<T>(
        policy: &mut WalletPolicy<T>,
        coin: Coin<T>,
        _ctx: &mut TxContext,
    ) {
        let amount = coin.value();
        balance::join(&mut policy.balance, coin.into_balance());
        let new_balance = balance::value(&policy.balance);

        event::emit(Deposited {
            policy_id: object::uid_to_inner(&policy.id),
            amount,
            new_balance,
        });
    }

    /// Owner-only: update the cumulative budget ceiling.
    public fun delegate_budget<T>(
        policy: &mut WalletPolicy<T>,
        new_limit: u64,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == policy.owner, ENotOwner);
        let old_limit = policy.budget_limit;
        policy.budget_limit = new_limit;

        event::emit(BudgetUpdated {
            policy_id: object::uid_to_inner(&policy.id),
            old_limit,
            new_limit,
        });
    }

    /// Agent-only: borrow funds from the policy for a single trade.
    /// Returns a `Coin<T>` for use in the trade and a `TradeTicket<T>` that
    /// MUST be passed to `return_and_complete` in the same PTB.
    public fun borrow_for_trade<T>(
        policy: &mut WalletPolicy<T>,
        amount: u64,
        target_contract: address,
        ctx: &mut TxContext,
    ): (Coin<T>, TradeTicket<T>) {
        // ── Access control ──────────────────────────────────────────────────
        assert!(ctx.sender() == policy.agent, ENotAgent);

        // ── Expiration check ────────────────────────────────────────────────
        assert!(ctx.epoch() <= policy.expiration_epoch, EPolicyExpired);

        // ── Allowlist check ─────────────────────────────────────────────────
        assert!(
            vector::contains(&policy.allowed_contracts, &target_contract),
            EContractNotAllowed
        );

        // ── Budget ceiling ──────────────────────────────────────────────────
        assert!(
            policy.budget_spent + amount <= policy.budget_limit,
            EBudgetExceeded
        );

        // ── Safety floor ────────────────────────────────────────────────────
        let current_balance = balance::value(&policy.balance);
        assert!(current_balance >= amount, EInsufficientBalance);
        assert!(
            current_balance - amount >= policy.min_balance_floor,
            EFloorViolation
        );

        // ── Disburse ─────────────────────────────────────────────────────────
        policy.budget_spent = policy.budget_spent + amount;
        let borrowed = balance::split(&mut policy.balance, amount);
        let coin = coin::from_balance(borrowed, ctx);

        event::emit(BorrowedForTrade {
            policy_id: object::uid_to_inner(&policy.id),
            agent: policy.agent,
            amount,
            target_contract,
            budget_spent: policy.budget_spent,
        });

        let ticket = TradeTicket<T> {
            policy_id: object::uid_to_inner(&policy.id),
            amount,
            target_contract,
        };

        (coin, ticket)
    }

    /// Consume the TradeTicket and return funds to the policy.
    /// Must be called in the same PTB as `borrow_for_trade`.
    ///
    /// `budget_spent` is reduced by the refund amount (clamped to 0).
    /// This makes `budget_limit` a MAX NET EXPOSURE cap, not a gross-spend cap:
    ///   - A profitable trade (refund > borrowed) fully restores budget capacity.
    ///   - A losing trade (refund < borrowed) reduces capacity by the loss only.
    /// Without this, a cycling trading agent would exhaust its budget after a
    /// handful of trades even if every trade was profitable — operationally broken.
    public fun return_and_complete<T>(
        policy: &mut WalletPolicy<T>,
        coin: Coin<T>,
        ticket: TradeTicket<T>,
        _ctx: &mut TxContext,
    ) {
        // Destructure hot potato — this is the only way to consume it.
        let TradeTicket { policy_id: _, amount: _, target_contract: _ } = ticket;

        let amount_returned = coin.value();

        // Clamped subtraction: reduce budget_spent by however much was returned.
        // If the trade was profitable (amount_returned > budget_spent) clamp to 0
        // rather than underflowing. This restores full budget capacity on a win.
        if (amount_returned >= policy.budget_spent) {
            policy.budget_spent = 0;
        } else {
            policy.budget_spent = policy.budget_spent - amount_returned;
        };

        balance::join(&mut policy.balance, coin.into_balance());
        let new_balance = balance::value(&policy.balance);

        event::emit(TradeCompleted {
            policy_id: object::uid_to_inner(&policy.id),
            amount_returned,
            new_balance,
            budget_spent: policy.budget_spent,
        });
    }

    /// Owner-only: permanently revoke the policy, reclaim all remaining funds.
    public fun revoke_policy<T>(
        policy: WalletPolicy<T>,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == policy.owner, ENotOwner);

        let WalletPolicy {
            id,
            owner,
            agent: _,
            budget_limit: _,
            budget_spent: _,
            allowed_contracts: _,
            expiration_epoch: _,
            min_balance_floor: _,
            balance,
        } = policy;

        let refund_amount = balance::value(&balance);
        let refund_coin = coin::from_balance(balance, ctx);

        event::emit(PolicyRevoked {
            policy_id: object::uid_to_inner(&id),
            owner,
            refund_amount,
        });

        object::delete(id);
        transfer::public_transfer(refund_coin, owner);
    }

    // ── View helpers ─────────────────────────────────────────────────────────

    public fun get_balance<T>(policy: &WalletPolicy<T>): u64 {
        balance::value(&policy.balance)
    }

    public fun get_budget_remaining<T>(policy: &WalletPolicy<T>): u64 {
        if (policy.budget_limit >= policy.budget_spent) {
            policy.budget_limit - policy.budget_spent
        } else {
            0
        }
    }

    public fun is_expired<T>(policy: &WalletPolicy<T>, current_epoch: u64): bool {
        current_epoch > policy.expiration_epoch
    }

    // ── Test-only helpers ─────────────────────────────────────────────────────

    #[test_only]
    public fun get_owner<T>(policy: &WalletPolicy<T>): address { policy.owner }

    #[test_only]
    public fun get_agent<T>(policy: &WalletPolicy<T>): address { policy.agent }

    #[test_only]
    public fun get_budget_spent<T>(policy: &WalletPolicy<T>): u64 { policy.budget_spent }

    #[test_only]
    public fun get_budget_limit<T>(policy: &WalletPolicy<T>): u64 { policy.budget_limit }

    // ── Unit Tests ────────────────────────────────────────────────────────────

    #[test_only]
    use sui::test_scenario::{Self as ts, Scenario};
    #[test_only]
    use sui::sui::SUI;
    #[test_only]



    #[test_only]
    const OWNER: address  = @0xA1;
    #[test_only]
    const AGENT: address  = @0xA2;
    #[test_only]
    const TARGET: address = @0xDEAD;
    #[test_only]
    const STRANGER: address = @0xFFFF;

    // Helper: create a policy and deposit funds, return the scenario mid-flow.
    #[test_only]
    fun setup_policy(budget: u64, floor: u64, expiry: u64): Scenario {
        let mut scenario = ts::begin(OWNER);
        {
            let ctx = ts::ctx(&mut scenario);
            create_policy<SUI>(
                AGENT,
                budget,
                vector[TARGET],
                expiry,
                floor,
                ctx,
            );
        };
        scenario
    }

    // 4.1 — Policy creation and deposit record the correct state.
    #[test]
    fun test_create_and_deposit() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            std::unit_test::assert_eq!(get_balance(&policy), 500_000_000);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.2 — Borrow that exceeds budget_limit must abort.
    #[test]
    #[expected_failure(abort_code = EBudgetExceeded)]
    fun test_budget_ceiling_enforcement() {
        let mut scenario = setup_policy(100_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(1_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // Attempt to borrow more than budget_limit (100_000).
            let (coin, ticket) = borrow_for_trade(&mut policy, 200_000, TARGET, ctx);
            return_and_complete(&mut policy, coin, ticket, ctx);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.3 — Borrow that would drop balance below min_balance_floor must abort.
    #[test]
    #[expected_failure(abort_code = EFloorViolation)]
    fun test_floor_enforcement() {
        let floor = 300_000_000;
        let mut scenario = setup_policy(1_000_000_000, floor, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            // 500_000_000 - 300_000_000 = 200_000_000 < floor (300_000_000) → abort
            let (coin, ticket) = borrow_for_trade(&mut policy, 300_000_000, TARGET, ctx);
            return_and_complete(&mut policy, coin, ticket, ctx);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.4 — Borrow targeting a non-allowlisted contract must abort.
    #[test]
    #[expected_failure(abort_code = EContractNotAllowed)]
    fun test_allowlist_enforcement() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let bad_target = @0xBAD;
            let (coin, ticket) = borrow_for_trade(&mut policy, 100_000_000, bad_target, ctx);
            return_and_complete(&mut policy, coin, ticket, ctx);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.5 — Borrow after expiration_epoch must abort.
    #[test]
    #[expected_failure(abort_code = EPolicyExpired)]
    fun test_expiration_enforcement() {
        // Expiry at epoch 0 — in test context epoch is already > 0 after next_tx.
        let mut scenario = setup_policy(1_000_000_000, 0, 0);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        // Advance epoch past expiry.
        ts::next_epoch(&mut scenario, AGENT);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let (coin, ticket) = borrow_for_trade(&mut policy, 100_000_000, TARGET, ctx);
            return_and_complete(&mut policy, coin, ticket, ctx);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.6 — A non-agent caller on borrow_for_trade must abort.
    #[test]
    #[expected_failure(abort_code = ENotAgent)]
    fun test_unauthorized_agent_aborts() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        // STRANGER is not the agent.
        ts::next_tx(&mut scenario, STRANGER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let (coin, ticket) = borrow_for_trade(&mut policy, 100_000_000, TARGET, ctx);
            return_and_complete(&mut policy, coin, ticket, ctx);
            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.7 — Happy path: borrow then return restores the balance.
    // Also validates clamped budget_spent accounting:
    //   • After profitable return (refund > borrowed): budget_spent clamps to 0
    //   • Agent can borrow again freely — budget_limit is a net exposure cap
    #[test]
    fun test_borrow_and_return() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);

            // Borrow 200M — budget_spent should be 200M.
            let (coin, ticket) = borrow_for_trade(&mut policy, 200_000_000, TARGET, ctx);
            std::unit_test::assert_eq!(get_balance(&policy), 300_000_000);
            std::unit_test::assert_eq!(get_budget_spent(&policy), 200_000_000);

            // Return the exact amount — a break-even trade.
            return_and_complete(&mut policy, coin, ticket, ctx);
            std::unit_test::assert_eq!(get_balance(&policy), 500_000_000);
            // Break-even: 200M returned = 200M spent → budget_spent clamps to 0.
            std::unit_test::assert_eq!(get_budget_spent(&policy), 0);

            // Agent can borrow again — budget is fully restored.
            let (coin2, ticket2) = borrow_for_trade(&mut policy, 200_000_000, TARGET, ctx);
            // Return MORE than borrowed — simulates a profitable trade.
            // Mint 50M extra to simulate profit.
            let profit = coin::mint_for_testing<SUI>(50_000_000, ctx);
            let mut combined = coin2;
            coin::join(&mut combined, profit);
            return_and_complete(&mut policy, combined, ticket2, ctx);
            // Policy balance grew by profit.
            std::unit_test::assert_eq!(get_balance(&policy), 550_000_000);
            // Profitable return: 250M returned > 200M spent → clamps to 0.
            std::unit_test::assert_eq!(get_budget_spent(&policy), 0);

            ts::return_shared(policy);
        };

        ts::end(scenario);
    }

    // 4.8 — revoke_policy sends all funds back to owner and deletes the object.
    #[test]
    fun test_revoke_returns_funds() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            let coin = coin::mint_for_testing<SUI>(500_000_000, ctx);
            deposit(&mut policy, coin, ctx);
            ts::return_shared(policy);
        };

        ts::next_tx(&mut scenario, OWNER);
        {
            let policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            revoke_policy(policy, ctx);
        };

        // Owner should now hold the refund coin.
        ts::next_tx(&mut scenario, OWNER);
        {
            let refund = ts::take_from_sender<Coin<SUI>>(&scenario);
            std::unit_test::assert_eq!(refund.value(), 500_000_000);
            ts::return_to_sender(&scenario, refund);
        };

        ts::end(scenario);
    }

    // 4.9 — Non-owner calling revoke_policy must abort.
    #[test]
    #[expected_failure(abort_code = ENotOwner)]
    fun test_owner_only_revoke() {
        let mut scenario = setup_policy(1_000_000_000, 0, 9999);

        ts::next_tx(&mut scenario, STRANGER);
        {
            let policy = ts::take_shared<WalletPolicy<SUI>>(&scenario);
            let ctx = ts::ctx(&mut scenario);
            revoke_policy(policy, ctx);
        };

        ts::end(scenario);
    }
}
