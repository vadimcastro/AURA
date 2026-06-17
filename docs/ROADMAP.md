# Roadmap & Dependencies

**Progress: [█████████████░░░░░░░] 65% Complete (65/100) — Testnet Prototype Complete, Production Hardening Pending**

## ✅ Dev Environment Status

> Last verified: 2026-06-17

| Item | Status | Detail |
|---|---|---|
| **Sui CLI** | ✅ Installed | `sui 1.73.1-ff1fe0ec4551` |
| **Active Network** | ✅ Testnet | `sui client active-env` → `testnet` |
| **Active Address** | ✅ Configured | `0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676` |
| **Testnet SUI Balance** | ✅ Funded | **1.85 SUI** (1,850,000,000 MIST) — ready for gas & test deploys |
| **Testnet dUSDC Balance** | ✅ Funded | **1000.00 DUSDC** (1,000,000,000 raw) — recovered, ready for trading |
| **Node.js** | ✅ Installed | Verified Node.js v18+ environment |
| **`@mysten/sui` SDK** | ✅ Installed | Installed in `sdk/` package dependencies |

---

## 🔧 Key Sui CLI Commands

### Environment & Wallet
```bash
sui --version                          # Check Sui CLI version
sui client active-env                  # Show active network (testnet/mainnet/devnet)
sui client active-address              # Show current wallet address
sui client balance                     # Show all coin balances
sui client envs                        # List all configured network environments
sui client switch --env testnet        # Switch to testnet
```

### Faucet & Tokens
```bash
sui client faucet                      # Request testnet SUI from faucet
```

### Move Contract Development
```bash
sui move build                         # Compile Move contracts (run from contracts_sui/)
sui move test                          # Run all Move unit tests
sui move test --filter <test_name>     # Run a specific test
sui move build --lint                  # Lint Move source files
```

### Deployment & Publishing
```bash
sui client publish --gas-budget 100000000          # Publish package to active network
sui client publish --gas-budget 200000000 --skip-fetch-latest-git-deps  # Skip git deps (faster)
```

### Object & Transaction Inspection
```bash
sui client object <OBJECT_ID>                      # Inspect an on-chain object
sui client tx-block <TX_DIGEST>                    # Inspect a transaction
sui client objects                                 # List all objects owned by active address
sui client call --package <PKG> --module <MOD> --function <FN> --gas-budget 10000000  # Call a Move function
```

### Useful Extras
```bash
sui keytool list                       # List all local keypairs
sui keytool generate ed25519           # Generate a new Ed25519 keypair
sui client gas                         # List gas coins owned by active address
```

---

## Phased Execution Plan

```text
 PHASE 1 (Contracts)  ──►  PHASE 2 (Off-Chain SDK)  ──►  PHASE 3 (Integration)  ──►  PHASE 4 (Demo)
 • Move Registry           • TypeScript PTB Builder      • DeepBook Predict        • Testnet deploy
 • Move Policy Wallet      • Walrus Log Uploader         • Seal encryption         • End-to-end demo
 • Move unit tests         • SVI arbitrage checker       • MemWal integration      • Video walkthrough
```

### ✅ Phase 1: Move Core Contracts — COMPLETE (2026-06-16)
*   ✅ Wrote `aura_registry.move` and `agent_wallet_policy.move` under `contracts_sui/sources`.
*   ✅ Implemented all functions: `create_policy`, `deposit`, `delegate_budget`, `borrow_for_trade`, `return_and_complete`, `revoke_policy`, `register_agent`, `assert_valid_agent`, `record_task_outcome`, `update_walrus_history`, `slash_bond`, `deregister_agent`.
*   ✅ 15/15 unit tests passing — zero errors, zero warnings (`sui move build && sui move test`).
*   ✅ Validated: budget ceiling, safety floor, allowlist, expiration, owner-only access control, slashing, deregistration, reputation math.


### ✅ Phase 2: Off-Chain TypeScript SDK — COMPLETE (2026-06-16)
*   ✅ Built `predict_agent.ts` with SVI parameter checks, time freshness assertions, and full PTB construction.
*   ✅ Built `walrus_archiver.ts` with client-side mock Seal encryption (AES-256-GCM) and Walrus publisher uploader.
*   ✅ Built `config.ts` parsing `.env` variables and resolving fallback/real hex addresses.
*   ✅ 25/25 unit & integration tests passing with ESM/NodeNext compilation.

### ✅ Phase 3: Protocol Integration — COMPLETE (2026-06-17)
*   ✅ Resolved DeepBook Predict testnet package and `mint_range` function signatures.
*   ✅ Built `MemWalClient` with dynamic fallback cache for persistent telemetry logs.
*   ✅ Implemented structured `SealEnvelope` formatting using locally simulated threshold keys.
*   ✅ Verified integration via comprehensive end-to-end simulation tests (38/38 unit/integration tests passing).

### ✅ Phase 4: Testnet Deploy & Demo — COMPLETE (2026-06-17)
*   ✅ Published Move contracts to Sui Testnet. Package ID: `0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef`
*   ✅ Shared Registry Object ID: `0x458bbc14f6fb58c8ba460e5167349602d5d368f354c843b310320682881f31d7`
*   ✅ Mock Options Pool Object ID: `0x319dd6c61b960465c27652dd2aff3638d3d00eeea4b6776f57d895f0134fae49`
*   ✅ Executed the complete successful options trading and telemetry-archiving cycle on Sui Testnet (Success Path Tx Digest: `96ggfYP8LDfDQajgur4MD6AhUVEEZFzgPavNGdrp5hiR`, Walrus Audit Blob: `xyfwRUYqWnmbw2C_9WUOMxrz1SMlJEzBumkoLg-AhFc`).
*   ✅ Verified all adversarial scenarios (budget ceiling, expired policy, unauthorized agent, admin slashing) correctly reverting on-chain.
*   ✅ Cleaned up dynamic policy wallet and recovered 1000 dUSDC to the owner's balance (Revoke Tx Digest: `EB5mw1ZhTBwWXQa7z5UbhGMfV8rKR5gK5ejCAVmhDPNW`).

---

## 🛡️ Production Hardening Tasks (Pending for Prod-Grade Release)

To upgrade AURA from a testnet prototype to a production-grade release:
*   **zkLogin Authentication Integration:** Implement real user zkLogin signing flows for setting up and revoking policy wallets, keeping owner private keys completely off the server.
*   **Real DeepBook Predict Mainnet Integration:** Transition from the testnet mock pool to direct mainnet integration with DeepBook Predict contracts.
*   **Threshold Key Infrastructure (Seal SDK):** Migrate from mock local AES encryption to real distributed threshold keys derived from policies to encrypt and decrypt Walrus telemetry logs.
*   **Authorized MemWal Integration:** Authenticate the off-chain bot via a valid MemWal token instead of the playground fallback.
*   **Formal Security Audit:** Conduct a formal audit of Move smart contracts, specifically using the Move Prover to verify that the `TradeTicket` hot potato cannot be dropped or copied under any circumstances.

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
| Sui CLI | `1.73.1` ✅ **Installed** | Contract compilation, publishing, and testnet interaction |
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
