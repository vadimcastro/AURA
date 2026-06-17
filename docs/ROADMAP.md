# Roadmap & Dependencies

**Progress: [█████████████████░░░] 85% Complete (85/100) — Visual Audit Studio Complete, Production Hardening Pending**

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
 PHASE 1 (Contracts)  ──►  PHASE 2 (Off-Chain SDK)  ──►  PHASE 3 (Integration)  ──►  PHASE 4 (Demo)  ──►  PHASE 5 (Dashboard)
 • Move Registry           • TypeScript PTB Builder      • DeepBook Predict        • Testnet deploy       • React/Vite/TS SPA
 • Move Policy Wallet      • Walrus Log Uploader         • Seal encryption         • End-to-end demo      • Walrus Visual Timeline
 • Move unit tests         • SVI arbitrage checker       • MemWal integration      • Video walkthrough    • Browser Seal Decrypter
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

### ✅ Phase 5: Visual Audit Studio Dashboard — COMPLETE (2026-06-17)
*   ✅ Scaffolded a modern React + TypeScript + Tailwind CSS application in `dashboard/`.
*   ✅ Implemented real-time on-chain data retrieval from Sui Testnet mapping registered agents from Registry dynamic fields.
*   ✅ Built an interactive visual timeline resolving and fetching encrypted Seal envelopes from Walrus Testnet.
*   ✅ Implemented client-side AES-GCM decryption in browser memory using Web Cryptography API.
*   ✅ Fully verified production compilation and bundler assets integration (`npm run build`).

---

## 🏆 Hackathon Submission Strategy & Costs

### 1. Mainnet Costs vs. Testnet Demonstrations
*   **Mainnet Gas & Collateral:** Deploying to Sui Mainnet requires real SUI for gas and real USDC/dUSDC for trading capital. 
*   **The Zero-Cost Solution:** For hackathon evaluations, **Sui Testnet and Walrus Testnet are 100% free and functional**. They execute the exact same Move VM logic, transaction fee structures, and cryptographic boundary checks as Mainnet. 
*   **Standard Practice:** Judges do not expect (and often discourage) developers from deploying experimental, un-audited agentic smart contracts on Mainnet with real funds. A fully functional Testnet prototype is the standard for a winning hackathon entry.

### 2. Hackathon Submission Readiness & Strength
*   **Current Prototype Strength:** **High.** AURA implements a complete AgentFi loop: an on-chain atomic security boundary (Hot Potato `TradeTicket`), dynamic budget enforcement (`WalletPolicy`), collateral-backed reputation (`aura_registry`), a fully functional off-chain agent script (`run_demo.ts`), and decentralized storage integration (Walrus).
*   **Is Production Hardening Required?** No. Hackathons reward technical novelty, architecture viability, and functional demos. Hardening items (like zkLogin, threshold key networks, and professional audits) are standard items for the "Future Roadmap".

### 3. Prioritized Pre-Submission Roadmap
To maximize our hackathon scoring potential before submitting, we prioritize the remaining work as follows:
1.  **Step-by-Step Interactive Demo (High Priority):** Implement a command-line flag (e.g., `npm run demo -- --interactive`) that pauses between each step (Policy Creation ➔ Deposit ➔ Registration ➔ Success Trade ➔ Adversarial Reverts ➔ Slashing ➔ Revocation) and outputs explanation cards with Sui Explorer links.
2.  **Telemetry Visualizer UI (Medium-High Priority):** A simple single-page Web application that queries the `Registry` on-chain, resolves the latest `walrus_history_id` blob, fetches it from the Walrus aggregator, and renders a clean visual dashboard showing the agent's recent trade decisions and SVI parameters.
3.  **Video Walkthrough Recording (Medium Priority):** A 3-minute video showing the codebase, running the interactive demo, showing transaction digests in the Sui Testnet Explorer, and fetching the audit trace from Walrus.

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

#### 🔧 User Prerequisites & Hosting Setup (Vercel Deploy)
To deploy the completed Phase 5 dashboard to Vercel, configure the following settings:
*   **Vercel Account:** For deploying the React/Vite frontend. Ensure you are ready to configure the following environment secrets in Vercel:
    *   `AURA_PACKAGE_ID`: `0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef`
    *   `REGISTRY_OBJECT_ID`: `0x458bbc14f6fb58c8ba460e5167349602d5d368f354c843b310320682881f31d7`
    *   `SUI_RPC_URL`: `https://fullnode.testnet.sui.io:443`
    *   `WALRUS_AGGREGATOR`: `https://aggregator.walrus-testnet.walrus.space`
    *   *Root Directory:* In your Vercel Project Settings, set the **Root Directory** to `dashboard/` (which we will scaffold next) so Vercel builds only the frontend module.
*   **Railway Account:** Prepared for deploying any optional caching microservices or indexer layers (if required by performance testing; we will prioritize a client-side-only architecture to minimize infrastructure complexity, but Railway is our backup hosting for server-side utilities).
*   **Wallet Setup:** Ensure your local browser wallet (e.g., Sui Wallet) is configured for Testnet and has a small SUI balance for testing frontend policy creations.

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
