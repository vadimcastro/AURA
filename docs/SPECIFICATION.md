# Implementation Plan: Project AURA (Autonomous Utility & Reputation Architecture)

A comprehensive, first-principles systems engineering specification and development plan for **AURA**—a Sui-native reputation routing, policy-enforced wallet, and verifiable memory auditing protocol for autonomous trading agents executing on DeepBook Predict.

---

## 🏛️ 1. Overall System Architecture & Design Philosophy

Project AURA solves the core tension of AgentFi: **how to delegate financial execution to autonomous code without exposing the user to total capital loss, fraud, or untrustworthy agents.**

The architecture is structured into three decoupled layers:
```text
  [ USER (zkLogin) ] ──► Deploy/Configure Policy ──► [ MOVE POLICY WALLET ]
                                                              │
                                                              ▼ (Atomic PTB Ticket Checks)
  [ DEEPBOOK PREDICT ] ◄──── Autonomously Trade ◄───── [ AURA REGISTRY ]
          │                                           (Stake Bond Check)
          ▼ (Event Emission)                          │
  [ WALRUS DECENTRALIZED DATA ] ◄── Archive Audits ───┘
```

*   **Move Policy Wallet (Execution Boundary):** Prevents the bot from moving funds to unapproved addresses. It uses a **Hot Potato / TradeTicket** pattern to ensure funds are exclusively used for allowed protocols (like DeepBook Predict) within an atomic Programmable Transaction Block (PTB).
    *   *Note:* The **User** (Owner/Supervisor) interacts via standard browser wallets (using `@mysten/dapp-kit`) or zkLogin to deploy, fund, adjust, or revoke policies, while the **Agent** interacts using its **ephemeral hot key** to sign automated trading actions autonomously within the bounds of the delegated ticket.
*   **Reputation Registry (Incentive Alignment):** Enforces skin-in-the-game collateral from bot operators, tracks performance history, and provides on-chain eligibility assertions.
*   **Walrus / MemWal (Telemetry & Audit):** Archives transaction reasoning, oracle inputs, and historical traces off-chain in a verifiable, Seal-encrypted format.

### A. How it Works (General Execution Flow with DeepBook Predict)
1. **Delegation Setup:** A user deposits tokens (e.g. `dUSDC` or `SUI`) into a shared `WalletPolicy` on-chain, configuring allowlisted targets (DeepBook Predict), expiration, and budget.
2. **Operator Staking:** The trading bot operator registers the bot address in AURA's `Registry` by staking a SUI bond to establish "skin in the game".
3. **Atomic PTB Trade Execution:** The bot queries volatility SVI parameters off-chain. If it discovers an arbitrage opportunity on DeepBook Predict, it broadcasts a single Programmable Transaction Block (PTB) containing:
   * **Assertion:** `aura_registry::assert_valid_agent` verifies the bot is registered, active, and has sufficient staked collateral.
   * **Borrow:** `agent_wallet_policy::borrow_for_trade` extracts the required trading balance and issues a hot potato `TradeTicket` (which has no capabilities and cannot be dropped or stored).
   * **Execution:** `deepbook_predict::mint_range` takes the borrowed coins and places the range orders on the DeepBook Predict pool, returning the remaining/refunded tokens.
   * **Return & Consume:** `agent_wallet_policy::return_and_complete` accepts the returned tokens and consumes the `TradeTicket`.
   * **Reputation Recording:** `aura_registry::record_task_outcome` increments the bot's task count and updates its reputation score on-chain.
4. **Verifiable Auditing:** The bot encrypts its reasoning, SVI inputs, and order details client-side via Seal, uploads the encrypted payload to Walrus, and commits the resulting `blob_id` on-chain via `update_walrus_history`.

### B. Instant Value Proposition
* **Zero-Loss Bounds:** Even if the bot is compromised, bugged, or hijacked, it physically cannot steal funds or lose more than the user's defined budget ceiling. The Move VM prevents the transaction from executing unless the funds return to the policy wallet.
* **Instant Trust Verification:** Liquidity providers can instantly view the bot operator's staked bond and on-chain reputation before delegating capital.
* **Verifiable Memory:** Users can audit the exact reason for every trade retrospectively without trusting the bot operator.

### C. Human UI Requirements
While the security layer is enforced at the Move VM level, a clean Web Frontend (the **Visual Audit Studio**) is vital to make this value instantly visible to human users:
* **For Users/LPs:** A simple dashboard to deploy policies, configure limits, deposit coins, view active bot reputation scores, and click a single "Revoke" button to reclaim all capital instantly.
* **For Bot Operators:** An interface to stake bonds, register bot keypairs, and monitor active drawdowns.
* **Audit Dashboard:** An inspector that queries the registry on-chain, fetches the encrypted audit payload from Walrus using the `blob_id`, decrypts the telemetry locally using the user's viewer key, and renders trade reasoning charts.
* **Vercel Serverless Hosting:** The Vite React frontend is hosted on Vercel (Project: `aura`), leveraging browser-side client RPC queries to communicate directly with Sui Testnet and the Walrus aggregator, ensuring a highly responsive, zero-maintenance global deployment.

### D. Protocol Scope & Role Boundary
AURA is **security and reputation middleware for AgentFi**:
* **In-Scope:** Developing the on-chain execution sandbox (Hot Potato enforcement, budget constraints, policy revocation) and the trust registry (SUI staking, reputation scoring, and Walrus audit logging).
* **Out-of-Scope:** We do *not* write the trading bots, algorithmic SVI volatility solvers, or the prediction markets themselves. AURA is designed to compose with any external agent (LLMs, Python scripts, statistical bots) and any target DeFi protocol (DeepBook, option markets, AMMs).

### E. The AURA Moat & Competitive Strategy
To stand out, stay on top, and provide unparalleled value, AURA builds its moat on three core structural flywheels that make it highly defensible and impossible to displace:

1. **The Liquidity-Reputation Flywheel (Network Effects):**
   * *The Mechanism:* Users (liquidity providers) will only delegate capital to agents through AURA's `WalletPolicy` because of the Move VM safety guarantees. As capital pools inside AURA policies, agent developers are forced to register on AURA's `Registry` to access this liquidity.
   * *The Moat:* More registered agents create a richer dataset of audit logs and reputation history. This data increases the reliability of AURA's reputation scores, attracting more user deposits. Once this flywheel starts spinning, a competitor cannot simply fork AURA's open-source code, because they cannot copy the **real SUI staked collateral** or the **verifiable on-chain reputation history** of the active agents.

2. **Verified Resume Lock-In (High Switching Costs):**
   * *The Mechanism:* Every trade, oracle input, and LLM reasoning trace is sealed and archived on Walrus, with the cryptographic proof committed to the agent's identity on-chain.
   * *The Moat:* Over time, an agent accumulates a massive, verifiable performance resume. If the agent developer attempts to switch to a copycat registry, they lose access to their on-chain track record. Re-building a reputation history takes months and requires risking capital. This creates high switching costs that lock successful agents into AURA.

3. **Move-Native Structural Advantage (Unparalleled Value):**
   * *The Mechanism:* AURA leverages Sui's unique **Hot Potato** type system (`TradeTicket` with no capabilities) to enforce post-execution states. 
   * *The Moat:* In EVM ecosystems (like Ethereum), delegated wallets check permissions *before* execution but cannot enforce what happens *during* the transaction (allowing bots to be front-run or execute poisoned trades). AURA's hot potato model physically prevents a transaction from compiling or executing unless the funds are returned to the policy wallet in the same atomic execution block. This level of VM-level security cannot be replicated on EVM without massive gas overhead and friction, making Sui the native home of secure AgentFi.

4. **Integration Composability (Standardization Lock-In):**
   * *The Mechanism:* AURA acts as the security middleware firewall. By standardizing the `borrow_for_trade` / `return_and_complete` interface, any new DeFi pool or prediction market on Sui integrates AURA easily.
   * *The Moat:* As more protocols natively support AURA's `TradeTicket` standard, it becomes the default routing framework. A competitor would have to convince the entire Sui DeFi ecosystem to support a new type signature, cementing AURA's position as the core financial routing firewall for all of Sui AgentFi.

---

## 📋 2. Scope, Roadmap & Dependencies

### A. Phased Execution Plan

```text
 PHASE 1 (Contracts)  ──►  PHASE 2 (Off-Chain SDK)  ──►  PHASE 3 (Integration)  ──►  PHASE 4 (Demo)
 • Move Registry           • TypeScript PTB Builder      • DeepBook Predict        • Testnet deploy
 • Move Policy Wallet      • Walrus Log Uploader         • Seal encryption         • End-to-end demo
 • Move unit tests         • SVI arbitrage checker       • MemWal integration      • Video walkthrough
```

1.  **Phase 1: Move Core Contracts**
    *   Write `aura_registry.move` and `agent_wallet_policy.move` under `contracts_sui/sources`.
    *   Implement all functions: `delegate_budget`, `deposit`, `borrow_for_trade`, `return_and_complete`, `revoke_policy`, `register_agent`, `assert_valid_agent`, `record_task_outcome`, `update_walrus_history`, `slash_bond`, `deregister_agent`.
    *   Write native Move unit tests to validate: budget ceiling enforcement, underflow-safe refund handling, expiration checks, safety floor, allowlist enforcement, owner-only access control, slashing mechanics, and event emission correctness.
2.  **Phase 2: Off-Chain TypeScript SDK**
    *   Build `predict_agent.ts` with the SVI arbitrage checker and full PTB construction (borrow → trade → return atomic flow).
    *   Build `walrus_archiver.ts` to encrypt audit traces via Seal and push to the Walrus publisher API.
    *   Build `config.ts` to manage testnet package IDs, object IDs, and dUSDC type tags from environment variables.
3.  **Phase 3: Protocol Integration**
    *   Resolve actual DeepBook Predict contract addresses and `mint_range` function signatures from the `predict-testnet-4-16` branch.
    *   Integrate MemWal Playground for delegated key authentication.
    *   Integrate Seal SDK for client-side encryption of audit traces.
    *   Request `dUSDC` faucet tokens via the official Tally form.
4.  **Phase 4: Testnet Deploy & Demo**
    *   Deploy Move contracts to Sui Testnet using `sui client publish`.
    *   Execute a full end-to-end demo: create policy → agent registers → agent borrows → trades on Predict → returns funds → logs to Walrus → owner revokes.
    *   Simulate adversarial scenarios: budget exhaustion, expired policy, unauthorized agent, admin slashing.
    *   Record a video walkthrough demonstrating every flow for final validation.

### B. Dependency & Toolchain Table

| Dependency | Version / Reference | Purpose |
|---|---|---|
| Sui CLI | `sui --version` ≥ 1.x (2024 Move edition) | Contract compilation, publishing, and testnet interaction |
| Move Edition | `edition = "2024.beta"` in `Move.toml` | Enables `public(package)`, struct field syntax |
| `@mysten/sui` | `^1.x` (latest) | TypeScript SDK for PTB construction, signing, and RPC queries |
| Sui Testnet RPC | `https://fullnode.testnet.sui.io:443` | Fullnode endpoint for `SuiClient` |
| DeepBook Predict | Branch `predict-testnet-4-16` | Predict protocol contracts on testnet |
| Predict Server | `https://predict-server.testnet.mystenlabs.com` | SVI oracle endpoint |
| dUSDC Faucet | [Tally Form](https://tally.so/r/Xx102L) | Request testnet dUSDC tokens |
| Walrus Publisher | `https://publisher.walrus-testnet.walrus.space` | Blob upload endpoint |
| Walrus Aggregator | `https://aggregator.walrus-testnet.walrus.space` | Blob retrieval endpoint |
| MemWal Playground | MemWal Walrus Memory docs | Delegated key auth for persistent agent storage |
| Seal | Seal docs / SDK | Client-side threshold encryption for audit traces |

---

## 🛑 3. Core Protocol: Move Policy Wallet (`agent_wallet_policy.move`)

Rather than granting a bot direct access to private keys or requiring manual signature prompts, the user deploys a shared policy object. This policy holds the assets (generic `Coin<T>`, e.g., `dUSDC`) and enforces atomic boundaries on execution using a **Hot Potato (TradeTicket)** pattern.

```rust
module aura::agent_wallet_policy {
    use sui::object::{Self, ID, UID};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use std::vector;

    // ── Structs ──────────────────────────────────────────────

    struct WalletPolicy<phantom T> has key, store {
        id: UID,
        owner: address,
        agent: address,
        budget_limit: u64,
        budget_spent: u64,
        allowed_contracts: vector<address>,
        expiration_epoch: u64,
        min_balance_floor: u64,   // Safety floor — borrow_for_trade refuses if balance would drop below this
        balance: Balance<T>,
    }

    /// A Hot Potato representing authorized temporary access to funds.
    /// It has no capabilities (key, store, drop, copy) and must be returned and
    /// consumed in the same transaction block (PTB) to prevent theft.
    struct TradeTicket<phantom T> {
        policy_id: ID,
        amount: u64,
        target_contract: address,
    }

    // ── Events ───────────────────────────────────────────────

    struct PolicyCreated has copy, drop {
        policy_id: ID,
        owner: address,
        agent: address,
        budget_limit: u64,
        expiration_epoch: u64,
        initial_balance: u64,
    }

    struct TradeBorrowed has copy, drop {
        policy_id: ID,
        agent: address,
        amount: u64,
        target_contract: address,
        budget_remaining: u64,
    }

    struct TradeCompleted has copy, drop {
        policy_id: ID,
        refund_value: u64,
        new_balance: u64,
        budget_spent: u64,
    }

    struct PolicyRevoked has copy, drop {
        policy_id: ID,
        owner: address,
        balance_returned: u64,
    }

    // ── Errors ───────────────────────────────────────────────

    const EUnauthorizedAgent: u64 = 0;
    const EBudgetExceeded: u64 = 1;
    const EInvalidTarget: u64 = 2;
    const EPolicyExpired: u64 = 3;
    const ETicketPolicyMismatch: u64 = 4;
    const ENotOwner: u64 = 5;
    const EBelowSafetyFloor: u64 = 6;

    // ── Functions ────────────────────────────────────────────

    /// Creates a new shared WalletPolicy funded by the owner's initial deposit.
    /// The policy is shared so both owner (for revocation/top-up) and agent (for trading) can access it.
    public fun delegate_budget<T>(
        initial_deposit: Coin<T>,
        agent: address,
        limit: u64,
        allowed: vector<address>,
        expiration: u64,
        min_floor: u64,
        ctx: &mut TxContext
    ) {
        let owner = tx_context::sender(ctx);
        let initial_balance = coin::value(&initial_deposit);
        let policy = WalletPolicy<T> {
            id: object::new(ctx),
            owner,
            agent,
            budget_limit: limit,
            budget_spent: 0,
            allowed_contracts: allowed,
            expiration_epoch: expiration,
            min_balance_floor: min_floor,
            balance: coin::into_balance(initial_deposit),
        };
        event::emit(PolicyCreated {
            policy_id: object::id(&policy),
            owner,
            agent,
            budget_limit: limit,
            expiration_epoch: expiration,
            initial_balance,
        });
        transfer::share_object(policy);
    }

    /// Owner-only: deposit additional funds into an existing policy without re-creating it.
    public fun deposit<T>(policy: &mut WalletPolicy<T>, coin: Coin<T>, ctx: &mut TxContext) {
        assert!(tx_context::sender(ctx) == policy.owner, ENotOwner);
        balance::join(&mut policy.balance, coin::into_balance(coin));
    }

    /// Allows the agent to borrow funds for a trade, returning a TradeTicket (Hot Potato).
    /// Enforces budget ceiling, expiration, contract allowlist, and minimum balance floor.
    public fun borrow_for_trade<T>(
        policy: &mut WalletPolicy<T>,
        amount: u64,
        target_contract: address,
        ctx: &mut TxContext
    ): (Coin<T>, TradeTicket<T>) {
        let sender = tx_context::sender(ctx);
        assert!(sender == policy.agent, EUnauthorizedAgent);
        assert!(tx_context::epoch(ctx) <= policy.expiration_epoch, EPolicyExpired);
        assert!(vector::contains(&policy.allowed_contracts, &target_contract), EInvalidTarget);
        assert!(policy.budget_spent + amount <= policy.budget_limit, EBudgetExceeded);

        // Safety floor check: prevent borrow if remaining balance would drop below minimum
        let remaining = balance::value(&policy.balance) - amount;
        assert!(remaining >= policy.min_balance_floor, EBelowSafetyFloor);

        policy.budget_spent = policy.budget_spent + amount;
        let coin = coin::from_balance(balance::split(&mut policy.balance, amount), ctx);

        let ticket = TradeTicket {
            policy_id: object::id(policy),
            amount,
            target_contract,
        };

        event::emit(TradeBorrowed {
            policy_id: object::id(policy),
            agent: sender,
            amount,
            target_contract,
            budget_remaining: policy.budget_limit - policy.budget_spent,
        });

        (coin, ticket)
    }

    /// Consumes the hot potato TradeTicket. Unused/earned balance is refunded to the policy.
    /// Uses clamped subtraction to handle profitable trades where refund > borrowed amount.
    /// 
    /// ### Cryptoeconomic Design: Buy/Burn Insurance vs. Yield Approach
    /// Rather than routing trading profits to generate yield (which introduces capital lock-up
    /// delays, centralizes voting power in third-party pools, and risks downstream smart contract
    /// failures), AURA implements a **0.5% protocol fee on net trading profits**.
    ///
    /// This fee is transferred directly to `@buy_and_burn_insurance`, executing a twin function:
    /// 1. **Deflationary Value Capture:** Accumulated fees buy back and burn the protocol token,
    ///    creating immediate, programmatic buy pressure that directly ties token value to 
    ///    marketplace success.
    /// 2. **Slashing Insurance Backstop:** The insurance pool acts as a mutual backing reservoir.
    ///    In the event of network partitions or transient oracle issues resulting in honest
    ///    operators being slashed, this pool dynamically re-collateralizes them, reducing risk.
    ///
    /// In contrast to a Yield approach (which yields slow, variable interest and introduces sell
    /// pressure as yield-earnings are constantly dumped), AURA's Buy/Burn Insurance hardcodes
    /// deflationary token capture directly into the Move runtime's execution boundary.
    public fun return_and_complete<T>(
        policy: &mut WalletPolicy<T>,
        coin: Coin<T>,
        ticket: TradeTicket<T>,
        ctx: &mut TxContext,
    ) {
        let TradeTicket { policy_id, amount: borrowed_amount, target_contract: _ } = ticket;
        assert!(object::id(policy) == policy_id, ETicketPolicyMismatch);

        let mut amount_returned = coin.value();

        // Enforce 0.5% protocol fee on profit if the trade was profitable (refund > borrowed_amount)
        if (amount_returned > borrowed_amount) {
            let profit = amount_returned - borrowed_amount;
            let protocol_fee = (profit * 5) / 1000; // 0.5%
            if (protocol_fee > 0) {
                // Split fee and transfer to the protocol fee destination (e.g., insurance pool or buy-and-burn module)
                let fee_coin = coin::split(&mut coin, protocol_fee, ctx);
                transfer::public_transfer(fee_coin, @buy_and_burn_insurance);
                amount_returned = amount_returned - protocol_fee;
            };
        };

        // Clamped subtraction: if the trade was profitable, amount_returned > budget_spent.
        // Without clamping, this would underflow and abort — locking winning trades.
        if (amount_returned >= policy.budget_spent) {
            policy.budget_spent = 0;
        } else {
            policy.budget_spent = policy.budget_spent - amount_returned;
        };

        balance::join(&mut policy.balance, coin.into_balance());

        event::emit(TradeCompleted {
            policy_id,
            amount_returned,
            new_balance: balance::value(&policy.balance),
            budget_spent: policy.budget_spent,
        });
    }

    /// Owner-only: destroys the policy, reclaims all remaining funds, and revokes agent access.
    /// Because this consumes the shared object, the agent can never borrow again.
    public fun revoke_policy<T>(policy: WalletPolicy<T>, ctx: &mut TxContext) {
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
        assert!(tx_context::sender(ctx) == owner, ENotOwner);
        let balance_returned = balance::value(&balance);
        let pid = object::uid_to_inner(&id);
        object::delete(id);
        let coin = coin::from_balance(balance, ctx);
        transfer::public_transfer(coin, owner);
        event::emit(PolicyRevoked {
            policy_id: pid,
            owner,
            balance_returned,
        });
    }

    // ── View Functions (for off-chain queries) ───────────────

    public fun get_budget_remaining<T>(policy: &WalletPolicy<T>): u64 {
        policy.budget_limit - policy.budget_spent
    }

    public fun get_balance<T>(policy: &WalletPolicy<T>): u64 {
        balance::value(&policy.balance)
    }

    public fun get_agent<T>(policy: &WalletPolicy<T>): address {
        policy.agent
    }

    public fun get_owner<T>(policy: &WalletPolicy<T>): address {
        policy.owner
    }
}
```

---

## 🔒 4. Core Protocol: Reputation Registry (`aura_registry.move`)

Handles the mathematical trust scores, performance bonds, slashing hooks, and Walrus audit trail linkage. Slashes can only be executed by authorized admin configurations (e.g. DAO arbiters or designated multisig addresses).

```rust
module aura::aura_registry {
    use sui::object::{Self, UID};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::event;
    use sui::sui::SUI;
    use sui::table::{Self, Table};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};

    // ── Structs ──────────────────────────────────────────────

    struct Registry has key {
        id: UID,
        agents: Table<address, AgentRecord>,
        admin: address, // DAO or Arbiter address authorized to execute slashing
    }

    struct AgentRecord has store {
        stake: Balance<SUI>,
        reputation_score: u64,    // Scaled to 10^6 (e.g. 500_000 = 50%)
        total_tasks: u64,
        successful_tasks: u64,
        walrus_history_blob: Option<vector<u8>>, // Latest Walrus blob ID for audit trail
        active: bool,
        blacklist_until: u64,
    }


    // ── Events ───────────────────────────────────────────────

    struct AgentRegistered has copy, drop {
        agent: address,
        stake_amount: u64,
    }

    struct AgentSlashed has copy, drop {
        agent: address,
        slashed_amount: u64,
        recipient: address,
    }

    struct AgentDeregistered has copy, drop {
        agent: address,
        bond_returned: u64,
    }

    struct TaskRecorded has copy, drop {
        agent: address,
        success: bool,
        new_reputation: u64,
        total_tasks: u64,
    }

    struct WalrusHistoryUpdated has copy, drop {
        agent: address,
        blob_id: vector<u8>,
    }

    // ── Errors ───────────────────────────────────────────────

    const EUnauthorizedAdmin: u64 = 0;
    const EAgentNotFound: u64 = 1;
    const EInsufficientBond: u64 = 2;
    const EAgentBlacklisted: u64 = 3;
    const ENotAgentOwner: u64 = 4;
    const EAgentAlreadyRegistered: u64 = 5;

    // ── Constants ────────────────────────────────────────────

    const MINIMUM_BOND_RATIO: u64 = 10;  // 10% of managed budget
    const PENITENT_MULTIPLIER: u64 = 30; // 30% for slashed agents re-entry
    const INITIAL_REPUTATION: u64 = 500_000; // 50% neutral start
    const REPUTATION_SCALE: u64 = 1_000_000; // 10^6 scaling factor

    // ── Functions ────────────────────────────────────────────

    public fun register_agent(
        registry: &mut AgentRegistry,
        stake: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(!table::contains(&registry.agents, sender), EAgentAlreadyRegistered);
        let stake_amount = coin::value(&stake);
        let metadata = AgentMetadata {
            owner: sender,
            reputation_score: INITIAL_REPUTATION,
            total_tasks: 0,
            successful_tasks: 0,
            stake_bond: coin::into_balance(stake),
            blacklist_until: 0,
            walrus_history_id: vector::empty(),
        };
        table::add(&mut registry.agents, sender, metadata);
        event::emit(AgentRegistered { agent: sender, stake_amount });
    }

    /// Read-only assertion: aborts if agent is unregistered, blacklisted, or under-bonded.
    /// Called by the agent's PTB before borrow_for_trade to prove on-chain eligibility.
    public fun assert_valid_agent(
        registry: &AgentRegistry,
        agent: address,
        ctx: &TxContext
    ) {
        assert!(table::contains(&registry.agents, agent), EAgentNotFound);
        let meta = table::borrow(&registry.agents, agent);
        assert!(tx_context::epoch(ctx) >= meta.blacklist_until, EAgentBlacklisted);
        assert!(balance::value(&meta.stake_bond) > 0, EInsufficientBond);
    }

    /// Records the outcome of a completed trade cycle. Updates task counters and
    /// recalculates reputation as a simple success ratio: (successful / total) * 10^6.
    /// Callable by the agent after each trade settlement.
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

    /// Updates the agent's Walrus audit trail reference to the latest blob_id.
    /// Callable by the agent after each Walrus upload.
    public fun update_walrus_history(
        registry: &mut AgentRegistry,
        blob_id: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.agents, sender), EAgentNotFound);
        let meta = table::borrow_mut(&mut registry.agents, sender);
        meta.walrus_history_id = blob_id;
        event::emit(WalrusHistoryUpdated { agent: sender, blob_id: meta.walrus_history_id });
    }

    /// Admin-only: slashes the agent's entire stake bond and transfers it to the recipient.
    public fun slash_bond(
        registry: &mut AgentRegistry,
        agent: address,
        recipient: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == registry.admin, EUnauthorizedAdmin);
        let meta = table::borrow_mut(&mut registry.agents, agent);
        let slashed_amount = balance::value(&meta.stake_bond);
        let slashed = balance::withdraw_all(&mut meta.stake_bond);
        transfer::public_transfer(coin::from_balance(slashed, ctx), recipient);
        event::emit(AgentSlashed { agent, slashed_amount, recipient });
    }

    /// Operator-only: withdraw excess SUI stake progressively as reputation score increases.
    /// Over time, reputational collateral replaces financial collateral.
    public fun withdraw_excess_stake(
        registry: &mut AgentRegistry,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.agents, sender), EAgentNotFound);
        let meta = table::borrow_mut(&mut registry.agents, sender);
        
        // Ensure owner is calling
        assert!(meta.owner == sender, ENotOwner);
        
        let current_stake = balance::value(&meta.stake_bond);
        
        // Determine dynamic minimum stake based on reputation score
        // formula: min_required_stake = base_min_stake * (1,000,000 - reputation) / 1,000,000
        let base_min_stake = 100_000_000; // 0.1 SUI testnet target
        let min_required = if (meta.reputation_score >= 1_000_000) {
            10_000_000 // 90% reduction at max reputation
        } else {
            (base_min_stake * (1_000_000 - meta.reputation_score)) / 1_000_000
        };
        
        assert!(current_stake >= amount, EInsufficientBalance);
        assert!(current_stake - amount >= min_required, EStakeFloorViolation);
        
        let split_balance = balance::split(&mut meta.stake_bond, amount);
        let coin = coin::from_balance(split_balance, ctx);
        transfer::public_transfer(coin, meta.owner);
        
        event::emit(StakeWithdrawn { agent: sender, amount_withdrawn: amount });
    }

    /// Agent owner: withdraw stake bond and remove from registry (clean exit).
    /// Only allowed if agent is not currently blacklisted.
    public fun deregister_agent(
        registry: &mut AgentRegistry,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(table::contains(&registry.agents, sender), EAgentNotFound);
        let meta = table::remove(&mut registry.agents, sender);
        let AgentMetadata {
            owner,
            reputation_score: _,
            total_tasks: _,
            successful_tasks: _,
            stake_bond,
            blacklist_until,
            walrus_history_id: _,
        } = meta;
        assert!(tx_context::epoch(ctx) >= blacklist_until, EAgentBlacklisted);
        let bond_returned = balance::value(&stake_bond);
        let coin = coin::from_balance(stake_bond, ctx);
        transfer::public_transfer(coin, owner);
        event::emit(AgentDeregistered { agent: sender, bond_returned });
    }

    // ── View Functions ───────────────────────────────────────

    public fun get_reputation(registry: &AgentRegistry, agent: address): u64 {
        let meta = table::borrow(&registry.agents, agent);
        meta.reputation_score
    }

    public fun get_stake_amount(registry: &AgentRegistry, agent: address): u64 {
        let meta = table::borrow(&registry.agents, agent);
        balance::value(&meta.stake_bond)
    }

    public fun is_registered(registry: &AgentRegistry, agent: address): bool {
        table::contains(&registry.agents, agent)
    }
}
```

---

## ⚡ 5. Off-Chain Agent: DeepBook Predict Trading Loop (`predict_agent.ts`)

The off-chain TypeScript agent queries the DeepBook Predict testnet SVI oracle. It builds the transaction payloads and manages its execution pipeline. By wrapping execution in `borrow_for_trade` and `return_and_complete`, the agent guarantees compliance with the policy wallet budget boundary in a single atomic transaction:

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const CLIENT = new SuiClient({ url: getFullnodeUrl("testnet") });
const PREDICT_SERVER = "https://predict-server.testnet.mystenlabs.com";

// ── Configuration (resolved in Phase 3 from testnet deployment) ──
// These placeholders are replaced with actual testnet addresses after `sui client publish`.
const AURA_PACKAGE      = "0x_aura_package";           // Published package ID
const REGISTRY_OBJECT    = "0x_registry_object_id";     // Shared AgentRegistry object
const DEEPBOOK_PREDICT   = "0x_deepbook_predict_contract";
const DEEPBOOK_POOL      = "0x_deepbook_pool_id";
const DUSDC_TYPE         = "0x_dUSDC_type_tag";

interface SVIParameters {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
}

// First-Principles Arbitrage Checker (Runs before submission to prevent poison trade execution)
function isArbitrageFree(svi: SVIParameters): boolean {
  // 1. Parameter boundary checks
  if (svi.sigma <= 0 || Math.abs(svi.rho) >= 1 || svi.b < 0) {
    return false;
  }
  
  // 2. Non-negativity check: w(x) >= 0 for all strikes x.
  // In raw SVI, variance is non-negative if:
  if (svi.a + svi.b * svi.sigma * Math.sqrt(1 - svi.rho * svi.rho) < 0) {
    return false;
  }

  // 3. Butterfly arbitrage check: probability density g(x) >= 0.
  // Asymptotically, density is positive if and only if: b * (1 + |rho|) < 2.
  if (svi.b * (1 + Math.abs(svi.rho)) >= 2) {
    return false;
  }

  return true;
}

async function runStrategyLoop(agentAddress: string, policyObjectId: string) {
  // Fetch SVI Volatility Surface from Predict Server
  const response = await fetch(`${PREDICT_SERVER}/oracle/svi`);
  const svi: SVIParameters = await response.json();

  // Off-chain freshness check (belt-and-suspenders with on-chain clock check)
  const sviTimestamp = (svi as any).timestamp ?? Date.now();
  if (Math.abs(Date.now() - sviTimestamp) > 15_000) {
    console.error("⚠️ SVI oracle data is stale (>15s delta). Aborting.");
    return;
  }

  if (!isArbitrageFree(svi)) {
    console.error("⚠️ Volatility surface is non-arbitrage-free. Stale oracle or manipulation detected! Aborting execution.");
    return;
  }

  // Construct Sui PTB
  const tx = new Transaction();
  const tradeAmount = 100_000_000; // e.g. 100 dUSDC
  
  // Step 1: Verify reputation on-chain
  tx.moveCall({
    target: `${AURA_PACKAGE}::aura_registry::assert_valid_agent`,
    arguments: [tx.object(REGISTRY_OBJECT), tx.pure.address(agentAddress)],
  });

  // Step 2: Borrow dUSDC funds and receive the TradeTicket (Hot Potato)
  const [borrowedCoin, tradeTicket] = tx.moveCall({
    target: `${AURA_PACKAGE}::agent_wallet_policy::borrow_for_trade`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(policyObjectId),
      tx.pure.u64(tradeAmount),
      tx.pure.address(DEEPBOOK_PREDICT)
    ]
  });

  // Step 3: Execute trade range on DeepBook Predict using the borrowed coin
  // NOTE: mint_range arguments are speculative — resolve against predict-testnet-4-16 branch in Phase 3.
  const [remainingCoin] = tx.moveCall({
    target: `${DEEPBOOK_PREDICT}::predict_pool::mint_range`,
    arguments: [
      tx.object(DEEPBOOK_POOL),
      borrowedCoin,
      tx.pure.vectorU8(new TextEncoder().encode("mint_range_args"))
    ]
  });

  // Step 4: Return remaining/refunded funds and consume the TradeTicket
  tx.moveCall({
    target: `${AURA_PACKAGE}::agent_wallet_policy::return_and_complete`,
    typeArguments: [DUSDC_TYPE],
    arguments: [
      tx.object(policyObjectId),
      remainingCoin,
      tradeTicket
    ]
  });

  // Step 5: Record task outcome on the reputation registry
  tx.moveCall({
    target: `${AURA_PACKAGE}::aura_registry::record_task_outcome`,
    arguments: [
      tx.object(REGISTRY_OBJECT),
      tx.pure.bool(true) // success — in production, derive from settlement result
    ]
  });

  // Step 6: Dry-run before paying gas to catch reverts early
  tx.setSender(agentAddress);
  const dryRun = await CLIENT.dryRunTransactionBlock({
    transactionBlock: await tx.build({ client: CLIENT }),
  });

  if (dryRun.effects.status.status !== "success") {
    console.error("⚠️ Dry-run failed:", dryRun.effects.status.error);
    return;
  }

  // Step 7: Sign and execute
  // const result = await CLIENT.signAndExecuteTransaction({
  //   signer: agentKeypair,  // Ed25519Keypair for the agent's ephemeral hot key
  //   transaction: tx,
  // });
  // console.log("✅ Trade executed:", result.digest);
}
```

---

## 💾 6. Off-Chain Agent: Walrus Verifiable Memory Archiving (`walrus_archiver.ts`)

Instead of bloating Sui state storage with heavy logs, we use **Walrus** as a verifiable audit trail. After each trade cycle, the agent encrypts and uploads a structured audit trace, then commits the `blob_id` on-chain to link it to its reputation identity.

### A. JSON Audit Trace Structure
```json
{
  "epoch": 242,
  "policy_wallet": "0x89e2...23ab",
  "agent_address": "0xfa12...9c01",
  "svi_surface": { "a": 0.04, "b": 0.1, "rho": -0.4, "m": 0.01, "sigma": 0.15 },
  "trade_decision": "Mint Range 68k-72k",
  "trade_amount_dusdc": 100000000,
  "refund_amount_dusdc": 97500000,
  "pnl_dusdc": -2500000,
  "arbitrage_check_passed": true,
  "model_reasoning_hash": "keccak256_of_llm_chain",
  "gas_balance_sui": 5200000000,
  "timestamp": "2026-06-15T23:40:00Z"
}
```

### B. Archiver Skeleton

```typescript
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";

const CLIENT = new SuiClient({ url: getFullnodeUrl("testnet") });
const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
const AURA_PACKAGE = "0x_aura_package";
const REGISTRY_OBJECT = "0x_registry_object_id";

interface AuditTrace {
  epoch: number;
  policy_wallet: string;
  agent_address: string;
  svi_surface: object;
  trade_decision: string;
  trade_amount_dusdc: number;
  refund_amount_dusdc: number;
  pnl_dusdc: number;
  arbitrage_check_passed: boolean;
  model_reasoning_hash: string;
  gas_balance_sui: number;
  timestamp: string;
}

// Step 1: Construct the audit trace after a trade cycle
function buildAuditTrace(tradeResult: any, svi: any, policyWallet: string, agentAddress: string): AuditTrace {
  return {
    epoch: tradeResult.epoch,
    policy_wallet: policyWallet,
    agent_address: agentAddress,
    svi_surface: svi,
    trade_decision: tradeResult.decision,
    trade_amount_dusdc: tradeResult.amount,
    refund_amount_dusdc: tradeResult.refund,
    pnl_dusdc: tradeResult.refund - tradeResult.amount,
    arbitrage_check_passed: true,
    model_reasoning_hash: tradeResult.reasoningHash,
    gas_balance_sui: tradeResult.gasBalance,
    timestamp: new Date().toISOString(),
  };
}

// Step 2: Encrypt with Seal (client-side, threshold encryption)
// In Phase 3, replace with actual Seal SDK call:
//   import { SealClient } from "@aspect-build/seal-sdk";
//   const sealClient = new SealClient({ ... });
//   const encrypted = await sealClient.encrypt({ data, policyObjectId });
async function encryptWithSeal(payload: Uint8Array): Promise<Uint8Array> {
  // Placeholder — in production, encrypt using Seal threshold keys
  // derived from the policy between User and DAO arbiter.
  return payload;
}

// Step 3: Upload encrypted blob to Walrus
async function uploadToWalrus(encryptedPayload: Uint8Array): Promise<string> {
  const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: encryptedPayload,
  });
  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.status} ${response.statusText}`);
  }
  const result = await response.json();
  // Walrus returns either { newlyCreated: { blobObject: { blobId } } }
  // or { alreadyCertified: { blobId } }
  const blobId = result.newlyCreated?.blobObject?.blobId ?? result.alreadyCertified?.blobId;
  if (!blobId) throw new Error("No blobId in Walrus response");
  return blobId;
}

// Step 4: Commit blob_id on-chain to link audit trail to reputation
async function commitBlobIdOnChain(blobId: string, agentKeypair: Ed25519Keypair): Promise<string> {
  const agentAddress = agentKeypair.toSuiAddress();
  const tx = new Transaction();
  // Convert blobId string to bytes for the Move vector<u8> parameter
  const blobIdBytes = new TextEncoder().encode(blobId);
  tx.moveCall({
    target: `${AURA_PACKAGE}::aura_registry::update_walrus_history`,
    arguments: [
      tx.object(REGISTRY_OBJECT),
      tx.pure.vector("u8", Array.from(blobIdBytes)),
    ],
  });
  // Sign and execute (same keypair as the agent)
  // const result = await CLIENT.signAndExecuteTransaction({ signer: agentKeypair, transaction: tx });
  // return result.digest;
  return "tx_digest_placeholder";
}

// Full archiving pipeline — called after each trade cycle
async function archiveTradeAudit(tradeResult: any, svi: any, policyWallet: string, agentKeypair: Ed25519Keypair) {
  const agentAddress = agentKeypair.toSuiAddress();
  // 1. Build structured trace
  const trace = buildAuditTrace(tradeResult, svi, policyWallet, agentAddress);

  // 2. Check gas budget before uploading
  const gasBalance = await CLIENT.getBalance({ owner: agentAddress });
  if (BigInt(gasBalance.totalBalance) < BigInt(1_000_000_000)) { // < 1 SUI
    console.error("⚠️ GAS_EXHAUSTED: Insufficient SUI for Walrus upload. Halting trade loop.");
    return;
  }

  // 3. Encrypt with Seal
  const payload = new TextEncoder().encode(JSON.stringify(trace));
  const encrypted = await encryptWithSeal(payload);

  // 4. Upload to Walrus
  const blobId = await uploadToWalrus(encrypted);
  console.log(`📦 Walrus blob uploaded: ${blobId}`);

  // 5. Commit on-chain
  const digest = await commitBlobIdOnChain(blobId, agentKeypair);
  console.log(`🔗 On-chain blob_id committed: ${digest}`);
}
```

### D. State History Compression & Context Optimization
To prevent LLM context window overflow when reasoning over long histories of trade executions, AURA implements **State History Compression (Hierarchical Summarization)**:
1. **Periodic Accumulation:** The agent tracks recent raw audit traces in-memory (`recentTracesMap`).
2. **Dense Compaction:** After every 5 trade cycles, the agent compiles these traces into a dense **Strategy Summary String** containing metrics such as total cycles, win-rate, net PnL, and trading bias (e.g. `BULLISH_WINNING` or `BEARISH_HEAVY`).
3. **Registry Compression Commit:** The agent uploads this compressed summary to Walrus, decrypts the generated blob, and calls `commitBlobIdOnChain` to overwrite the on-chain history reference.
4. **Reflective Context Loading:** When initializing subsequent trade cycles, the agent downloads the latest history blob. If the blob is a compressed summary, it parses the summary metrics directly into the LLM prompt as context, preventing context window bloating.

### E. OpenRouter Live LLM Integration
When `OPENROUTER_API_KEY` is present, the agent automatically queries a live OpenRouter model (`meta-llama/llama-3-8b-instruct:free`) to generate options pricing parameters. The LLM is provided with:
- SVI volatility parameters from the DeepBook SVI Oracle.
- The compressed history summary or the previous cycle's PnL.
It outputs a JSON response matching a strict schema, including its reasoning and confidence score, which is validated before executing any Programmable Transaction Block.

#### Pros and Cons of Using OpenRouter in AURA AgentFi:
| Category | Pros | Cons |
|---|---|---|
| **API Architecture** | **Unified Interface:** Accesses hundreds of open-source and proprietary models (Llama, Claude, GPT, Gemini) through a single, standardized OpenAI-compatible API payload. Avoids multi-client library bloating. | **Centralized Dependency:** If OpenRouter's routing proxy layer experiences downtime, the fallback pipeline fails even if individual underlying providers are active. |
| **Economics & Testing** | **Free Model Tier:** Offers free instructs (e.g. Llama-3-8B-Instruct, Mistral-7B) perfect for low-cost hackathon demos and community developer testing without faucet/credit card friction. | **Provider Latency Overhead:** Proxied requests travel through routing hops, adding a 100ms - 500ms latency overhead compared to direct API endpoint calls. |
| **Resilience & Fallback** | **Dynamic Routing Fallbacks:** Allows switching underlying model paths dynamically via simple configuration changes without rewriting core SDK execution blocks. | **Free Tier Reliability:** Best-effort hosting models are susceptible to transient timeouts, high queue delays, and sudden rate limits during peak usage. |
| **Compliance** | **Privacy Protection:** Decouples user-specific account generation from commercial AI companies, reducing exposure to downstream API key harvesting. | **Strict Output Verification:** Some free hosts route without native JSON formatting modes, requiring robust schema validators (like AURA's `validateLLMReasoning`) to prevent output hallucinations. |

### C. Verifiable Upload & Privacy Flow (MemWal + Seal)
*   **MemWal Playground Key Auth:** The agent authenticates to the MemWal (Walrus Memory) platform using a delegated API client key, gaining access to its persistent storage bucket.
*   **Seal Client-Side Encryption:** To keep proprietary trading reasoning private, the agent encrypts the JSON audit trace locally using **Seal** before uploading. The encryption utilizes a public key derived from a threshold/multisig arrangement between the User and a DAO arbiter.
*   **Verifiable Storage:** The encrypted file is uploaded to the Walrus Testnet publisher, which returns a cryptographic `blob_id`.
*   **On-Chain Registry Record:** The agent commits a lightweight Sui transaction recording the `blob_id` to its `AgentMetadata` registry object via `update_walrus_history`, mapping the audit history permanently to its reputation identity.
*   **Dispute Verification:** If a dispute is filed (e.g. alleging limit violations or rogue trading), the user/DAO requests access to the reasoning. The threshold key shares are aggregated to decrypt the trace, verifying if the agent's internal logic was compliant with risk guidelines.

---

## 🛡️ 7. Critical Edge Cases & Failure Modes

### A. The "Flash Crash / Sudden Liquidation" Risk
*   **The Issue:** An agent takes a leveraged Predict position, and a sudden market move triggers an on-chain liquidation before the agent can react.
*   **The Resolution:** The `WalletPolicy` enforces a `min_balance_floor` field. Every call to `borrow_for_trade` asserts that the post-borrow balance remains above this floor, preventing the agent from over-committing capital into illiquid positions. If a flash crash drains a position below the safety margin, the agent physically cannot open new trades until the balance recovers or the owner tops up via `deposit`. Additionally, the off-chain agent runs a pre-flight `dryRunTransactionBlock` check before every PTB submission to detect revert-risk before paying gas.
*   **Escalation Path:** If the agent's cumulative PnL breaches a configurable drawdown threshold (tracked off-chain), the off-chain keeper pauses the loop and emits a Walrus alert trace. The user can then invoke `revoke_policy` to reclaim remaining funds.

### B. Oracle Feeder Latency & Front-Running
*   **The Issue:** The Predict server lags or emits stale SVI parameters, allowing external searchers to front-run the agent's range adjustments.
*   **The Resolution:** Freshness is enforced at two layers:
    1.  **Off-chain (TypeScript agent):** Before constructing the PTB, the agent compares the SVI response's `timestamp` field against `Date.now()`. If the delta exceeds 15 seconds, the agent aborts and logs a stale-oracle event to Walrus.
    2.  **On-chain (Move contract):** If DeepBook Predict's oracle module exposes a `sui::clock::Clock`-based timestamp on its `OracleSVI` object, `borrow_for_trade` can accept a `&Clock` reference and compare `clock::timestamp_ms(clock)` against the oracle's last-update field. This provides a belt-and-suspenders guarantee that even a compromised off-chain agent cannot execute against stale data.

### C. Walrus Storage Gas Reservoir Exhaustion
*   **The Issue:** The agent runs out of SUI to pay for Walrus storage writes, causing execution traces to stop uploading, which triggers automatic slashing for audit failures.
*   **The Resolution:** The off-chain agent maintains a **gas budget monitor**: before each Walrus upload, it queries its own SUI balance and compares against a configurable minimum (e.g. 1 SUI). If the balance is insufficient, the agent halts the trading loop and logs a `GAS_EXHAUSTED` status to its last Walrus entry. The policy wallet's `min_balance_floor` provides a secondary on-chain guardrail — the agent cannot drain the wallet to zero to pay for gas, because `borrow_for_trade` will abort.

### D. Agent Key Compromise
*   **The Issue:** The agent's ephemeral hot key is leaked or stolen, allowing an attacker to execute trades within the policy bounds.
*   **The Resolution:** The blast radius is bounded by design: the attacker can only trade within the `budget_limit`, only against `allowed_contracts`, and only until `expiration_epoch`. The user can immediately call `revoke_policy` to destroy the policy and reclaim all funds. The short expiration window (typically 24h) limits the exposure period. Post-compromise, the user deploys a new policy with a fresh agent key.

---

## 🌐 8. System Expansion & Strategic Positioning

Beyond the core system, AURA's architecture is designed to expand into a general-purpose infrastructure layer for the Sui AgentFi ecosystem.

### A. General-Purpose Security Middleware Primitive
The `WalletPolicy<T>` and `AgentRegistry` are intentionally generic — they are not coupled to DeepBook Predict or any specific strategy. Any third-party DeFi agent, market maker, or copy-trading vault on Sui can deploy AURA's policy wallet and register in the reputation registry to signal trust to their LPs. The `TradeTicket` hot potato pattern composes with any Move contract that accepts `Coin<T>`, making AURA a **plug-and-play security layer** rather than a monolithic application.

### B. Visual Audit Studio Dashboard *(Completed in Phase 5)*
A lightweight Web frontend that makes Walrus audit data legible to users and LPs:
*   **Real-time Timeline:** Queries Sui for agent metadata → resolves `blob_id` hashes → fetches audit payloads from Walrus aggregator.
*   **Seal Decryption Interface:** User imports their private viewer key to decrypt and inspect the agent's historical SVI oracle checks, trade decisions, and model reasoning directly in the browser.
*   **Agent Comparison:** Side-by-side reputation scores, PnL curves, and audit trail density for multiple registered agents.

### C. Optimistic Slashing & Decentralized Dispute Resolution *(Implemented in Phase 7)*
To remove the single-point-of-failure admin key in the reputation registry, we have implemented an **Optimistic Slashing** game-theory model that replaces the trusted admin with cryptoeconomic incentives:
1.  **Dispute Bond:** A user flags an agent for a rules violation by locking a SUI bond (0.1 SUI for Testnet, 1.0 SUI for Mainnet) and calling `submit_dispute` to register a `Dispute` object on-chain referencing the suspect `blob_id`.
2.  **Disclosure Window:** The agent operator has a 24-hour challenge period (enforced via `sui::clock` on-chain) to call `disclose_telemetry_key`, proving compliance by publishing the Seal decryption key for the challenged trace.
3.  **Resolution Invariants**:
    *   *Timeout Slash:* If the operator fails to publish the key within 24 hours → anyone can call `resolve_dispute` to automatically slash the operator's locked staked bond, award it to the disputer, and mark the agent inactive.
    *   *Key Disclosed:* If the key is disclosed, the dispute is marked resolved, and the disputer's locked bond is refunded back to them.
4.  **Griefing Resistance:** The required dispute bond (0.1 SUI / 1.0 SUI) prevents griefing of operators, ensuring that challengers must back their challenges with real economic value.

### D. Sui Kiosk NFT Wrapping (`agent_nft.move`) *(Implemented in Phase 7)*
To support the monetization of high-performing autonomous strategies, AURA enables operators to wrap their reputational identities into tradeable NFTs:
1.  **`AgentNFT` Struct:** Implements the `key` and `store` abilities containing the operator's `agent_address`, strategy parameter `name`, `description`, `strategy_type` tag, the current snapshot of their `reputation_score`, and an `image_url` metadata reference.
2.  **`mint_nft` Entry:** Verifies that the caller is an active, registered agent operator in the `Registry` and extracts their current reputation score snapshot.
3.  **Sui Kiosk Integration:** The `create_kiosk_and_place` function creates a new `sui::kiosk::Kiosk` shared object, mints the `AgentNFT`, places it inside the Kiosk, and transfers the `KioskOwnerCap` capability to the operator. This enables strategy renting, listing, and trading with royalty enforcement.

### E. Hybrid Wallet Connection Onboarding *(Implemented in Phase 7)*
*   **Browser Wallet (dApp-kit):** Integrates `@mysten/dapp-kit` (version 1.1.1+) and `@tanstack/react-query` to support native browser wallet connections (Backpack, Sui Wallet, Surf). Traditional wallets act as the secure administration interface for the Owner/Supervisor (collateral deposit/withdrawal, policy updates, and liquidation).
*   **zkLogin Socials:** Implements Google, GitHub, and Apple zkLogin connections in parallel to simplify friction-free social onboarding for Web2 operators.
*   **Sui v2 SDK Compatibility:** Deployed client-side queries utilizing the new `SuiJsonRpcClient` and `JsonRpcHTTPTransport` connection patterns.
