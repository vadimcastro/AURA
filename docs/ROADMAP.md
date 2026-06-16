# Roadmap & Dependencies

## Phased Execution Plan

```text
 PHASE 1 (Contracts)  ──►  PHASE 2 (Off-Chain SDK)  ──►  PHASE 3 (Integration)  ──►  PHASE 4 (Demo)
 • Move Registry           • TypeScript PTB Builder      • DeepBook Predict        • Testnet deploy
 • Move Policy Wallet      • Walrus Log Uploader         • Seal encryption         • End-to-end demo
 • Move unit tests         • SVI arbitrage checker       • MemWal integration      • Video walkthrough
```

### Phase 1: Move Core Contracts
*   Write `aura_registry.move` and `agent_wallet_policy.move` under `contracts_sui/sources`.
*   Implement all functions: `delegate_budget`, `deposit`, `borrow_for_trade`, `return_and_complete`, `revoke_policy`, `register_agent`, `assert_valid_agent`, `record_task_outcome`, `update_walrus_history`, `slash_bond`, `deregister_agent`.
*   Write native Move unit tests to validate: budget ceiling enforcement, underflow-safe refund handling, expiration checks, safety floor, allowlist enforcement, owner-only access control, slashing mechanics, and event emission correctness.

### Phase 2: Off-Chain TypeScript SDK
*   Build `predict_agent.ts` with the SVI arbitrage checker and full PTB construction (borrow → trade → return atomic flow).
*   Build `walrus_archiver.ts` to encrypt audit traces via Seal and push to the Walrus publisher API.
*   Build `config.ts` to manage testnet package IDs, object IDs, and dUSDC type tags from environment variables.

### Phase 3: Protocol Integration
*   Resolve actual DeepBook Predict contract addresses and `mint_range` function signatures from the `predict-testnet-4-16` branch.
*   Integrate MemWal Playground for delegated key authentication.
*   Integrate Seal SDK for client-side encryption of audit traces.
*   Request `dUSDC` faucet tokens via the official Tally form.

### Phase 4: Testnet Deploy & Demo
*   Deploy Move contracts to Sui Testnet using `sui client publish`.
*   Execute a full end-to-end demo: create policy → agent registers → agent borrows → trades on Predict → returns funds → logs to Walrus → owner revokes.
*   Simulate adversarial scenarios: budget exhaustion, expired policy, unauthorized agent, admin slashing.
*   Record a video walkthrough demonstrating every flow for hackathon submission.

---

## Future Work

### Phase 5: Visual Audit Studio Dashboard
A lightweight Web frontend that makes Walrus audit data legible to users and LPs:
*   **Real-time Timeline:** Queries Sui for agent metadata → resolves `blob_id` hashes → fetches audit payloads from Walrus aggregator.
*   **Seal Decryption Interface:** User imports their private viewer key to decrypt and inspect the agent's historical SVI oracle checks, trade decisions, and model reasoning directly in the browser.
*   **Agent Comparison:** Side-by-side reputation scores, PnL curves, and audit trail density for multiple registered agents.

### Phase 6: Optimistic Slashing & Decentralized Dispute Resolution
To remove the single-point-of-failure admin key in the reputation registry, introduce an **Optimistic Slashing** game-theory model that replaces the trusted admin with cryptoeconomic incentives:
1.  **Dispute Bond:** A user flags an agent for a rules violation by locking a small SUI bond and submitting a `Dispute` object on-chain referencing the suspect `blob_id`.
2.  **Disclosure Window:** The agent operator has a configurable challenge period (e.g. 24 hours, enforced via `sui::clock`) to publish the Seal decryption key for the corresponding Walrus trace.
3.  **Resolution:**
    *   If the operator fails to publish the key within the window → automatic slashing of the performance bond, dispute bond refunded to the user.
    *   If the key is published → a DAO committee (or on-chain oracle) verifies the decrypted trace against the policy bounds. Innocent → user's dispute bond is awarded to the operator. Guilty → operator's performance bond is slashed and distributed to the user.
4.  **Griefing Resistance:** The dispute bond cost is calibrated to make frivolous disputes unprofitable — the disputer risks losing their bond if the agent is proven innocent.

---

## Dependency & Toolchain Table

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
