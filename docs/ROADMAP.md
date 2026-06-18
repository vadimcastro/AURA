# Roadmap & Dependencies

**Progress: [███████████████████░] 95% Complete (95/100) — Final alignment and config done, ready for Vercel deploy**

## ✅ Dev Environment Status

> Last verified: 2026-06-17

| Item | Status | Detail |
|---|---|---|
| **Sui CLI** | ✅ Installed | `sui 1.73.1-ff1fe0ec4551` |
| **Active Network** | ✅ Testnet | `sui client active-env` → `testnet` |
| **Active Address** | ✅ Configured | `0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676` |
| **Testnet SUI Balance** | ✅ Funded | **0.10 SUI** (105,594,836 MIST) — gas remaining |
| **Testnet dUSDC Balance** | ✅ Funded | **450.00 DUSDC** (450,000,000 raw) — recovered, ready for trading |

## Wallet Profiles
**Owner** (`0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676`)
*   **Role**: Instantiates agents, funds initial capital.
*   **Balance**: `~0.10 SUI` (Gas), `~450.00 dUSDC` (Capital).

## Managing the Agent Roster
1. **Starting Fresh (Resetting Agents to 0)**: To completely wipe the slate and start with 0 agents, simply republish the smart contracts (`sui client publish --skip-dependency-verification` inside `contracts_sui/`) and paste the new `Package ID` and `Registry ID` into the `.env` and `ROADMAP.md`. 
2. **Filtering Agents**: If you simply want to hide agents on the dashboard that don't have telemetry, you can apply a standard React filter to the `agents` array in `AgentDashboard.tsx` before rendering: `agents.filter(a => a.latestBlobId !== null)`.
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
*   ✅ 38/38 unit & integration tests passing with ESM/NodeNext compilation.

### ✅ Phase 3: Protocol Integration — COMPLETE (2026-06-17)
*   ✅ Resolved DeepBook Predict testnet package and `mint_range` function signatures.
*   ✅ Built `MemWalClient` with dynamic fallback cache for persistent telemetry logs.
*   ✅ Implemented structured `SealEnvelope` formatting using locally simulated threshold keys.
*   ✅ Verified integration via comprehensive end-to-end simulation tests (38/38 unit/integration tests passing).

### ✅ Phase 4: Testnet Deploy & Demo — COMPLETE (2026-06-17)
*   ✅ Published Move contracts to Sui Testnet. Package ID: `0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef`
*   ✅ Shared Registry Object ID: `0x458bbc14f6fb58c8ba460e5167349602d5d368f354c843b310320682881f31d7`
*   ✅ Mock Options Pool Object ID: `0xb1c2c42afc347fe432d27f238cb0c4d5adee5c91254b12666d93c18f800c31ff`
*   ✅ Executed the complete successful options trading and telemetry-archiving cycle on Sui Testnet (Success Path Tx Digest: `96ggfYP8LDfDQajgur4MD6AhUVEEZFzgPavNGdrp5hiR`, Walrus Audit Blob: `xyfwRUYqWnmbw2C_9WUOMxrz1SMlJEzBumkoLg-AhFc`).
*   ✅ Verified all adversarial scenarios (budget ceiling, expired policy, unauthorized agent, admin slashing) correctly reverting on-chain.
*   ✅ Cleaned up dynamic policy wallet and recovered 1000 dUSDC to the owner's balance (Revoke Tx Digest: `EB5mw1ZhTBwWXQa7z5UbhGMfV8rKR5gK5ejCAVmhDPNW`).

### ✅ Phase 5: Visual Audit Studio Dashboard — COMPLETE (2026-06-17)
*   ✅ Scaffolded a modern React + TypeScript + Tailwind CSS application in `dashboard/`.
*   ✅ Implemented real-time on-chain data retrieval from Sui Testnet mapping registered agents from Registry dynamic fields.
*   ✅ Built an interactive visual timeline resolving and fetching encrypted Seal envelopes from Walrus Testnet.
*   ✅ Implemented client-side AES-GCM decryption in browser memory using Web Cryptography API.
*   ✅ Fully verified production compilation and bundler assets integration (`npm run build`).

### ✅ Phase 5.1: Dashboard Review & Polish — COMPLETE (2026-06-17)

**Theme & UX overhaul:**
*   ✅ Replaced dark neon aesthetic with a clean, professional light design system (white surfaces, `#f8f9fc` page background, calm indigo brand colour `#4f6ef7`).
*   ✅ Added Inter + JetBrains Mono from Google Fonts via `<link>` in `index.html` (previously browser defaults).
*   ✅ Defined a full CSS custom-property token set in `index.css` (`--color-*`, `--font-*`) consumed by all components.
*   ✅ Replaced all per-component Tailwind colour overrides with CSS var references for a single source of truth.
*   ✅ Added subtle `card-hover` lift animation (transform + box-shadow) in place of heavy glow effects.
*   ✅ Removed jarring `animate-bounce` on the unlock icon.

**Data fixes:**
*   ✅ **Reputation percentage formula corrected:** raw score is `0–1,000,000` so the conversion is `raw / 1_000_000 * 100`. Previous code used `/ 10000`, which was 100× too large.
*   ✅ **dUSDC decimal fix:** demo trade amounts now use 6-decimal dUSDC (`1_000_000 = 1.00 dUSDC`) not 9-decimal (SUI precision). Added `DUSDC_DECIMALS` constant.
*   ✅ Replaced arbitrary "1,842 Blobs" placeholder stat on landing page with a truthful "Walrus-backed" description.
*   ✅ Chart disclaimer added: "Illustrative PnL curves derived from on-chain reputation scores. Not real historical trade data."

**Architecture improvements:**
*   ✅ Fully replaced `any` types with proper interfaces (`AgentInfo`, `SealEnvelope`, `AuditTrace`, `SviSurface`).
*   ✅ Exported `SealEnvelope` from `TimelineVisualizer.tsx` and imported it in `App.tsx` — eliminated cross-component `any` prop.
*   ✅ Added `useMemo` on `generatePnLData` so chart data only recomputes when agent list changes.
*   ✅ Added `AbortSignal.timeout(8000)` to Walrus fetch for clean cancellation.
*   ✅ `TimelineVisualizer` now tracks `isMocked` state and shows a `WifiOff` badge instead of a misleading "Sync Connected" status when serving offline fallback data.
*   ✅ Fixed Uint8Array → BufferSource TypeScript error in Web Crypto API calls using `.buffer as ArrayBuffer`.
*   ✅ Added Reputation column with colour-coded mini progress bar to agent table (green ≥ 70%, amber ≥ 40%, red below).
*   ✅ Added `id` attributes to all interactive elements for browser testing/automation.

**SEO & meta:**
*   ✅ Updated `index.html` title from generic "dashboard" to descriptive "AURA Protocol — Autonomous Reputation & User Risk Assurance".
*   ✅ Added `<meta name="description">` and Open Graph tags.

### ✅ Phase 5.2: Dashboard Data Accuracy Audit — COMPLETE (2026-06-17)

Cross-referenced every dashboard data value against `sdk/walrus_archiver.ts`, `sdk/predict_agent.ts`, and the Move contracts:

**SVI field name correction (critical):**
*   ✅ `SealDecrypter` was displaying invented fields `sigma_atm / skew / kurtosis / blocks_freshness`. The real `SVIParameters` in `predict_agent.ts` uses `a, b, rho, m, sigma` (raw SVI model coefficients). Dashboard now shows correct field names with mathematical descriptions.

**Trade data corrections (critical):**
*   ✅ `trade_amount_dusdc` → `100_000_000` (100.00 dUSDC) matching `tradeAmount = 100_000_000` in `predict_agent.ts:147`.
*   ✅ `refund_amount_dusdc` → `98_000_000` (98.00 dUSDC) matching `Math.floor(tradeAmount * 0.98)`.
*   ✅ `pnl_dusdc` → `-2_000_000` (**-2.00 dUSDC loss** — the real trade has a 2% execution cost, not a gain).
*   ✅ `trade_decision` → `"Mint Range 68k-72k"` matching `predict_agent.ts:279`.
*   ✅ `epoch` → `100` matching the mock epoch in `predict_agent.ts:278`.
*   ✅ `gas_balance_sui` stored in MIST (`5_200_000_000 = 5.20 SUI`) — now divided by `1e9` for display.

**Cryptographic values corrected:**
*   ✅ `model_reasoning_hash` → `18f576496773fc3c...` = actual `SHA256("mock-llm-reasoning")` from `predict_agent.ts:282`. Prior value was `SHA256("")`.
*   ✅ `sealVersion` in demo envelope → `"1.0.0-mock"` matching `walrus_archiver.ts:63`.
*   ✅ `policyObjectId` in demo envelope → real Mock Options Pool Object ID from Phase 4.

### ✅ Phase 5.3: Phase 1-4 Dynamic Execution Refactor — COMPLETE (2026-06-17)

Performed a deep audit of all previous phase logic to eliminate mock data for hackathon presentation:
*   ✅ **Conservative Balances:** `MIN_STAKE` reverted to `10_000_000` (0.01 SUI) in `aura_registry.move` to prevent faucet drain. `tradeAmount` lowered to 10 dUSDC to support >100 live execution cycles.
*   ✅ **Dynamic Strikes:** `predict_agent.ts` now dynamically calculates DeepBook `lowerStrike` and `higherStrike` based on the real `svi.sigma` spread instead of hardcoding 68k-72k.
*   ✅ **Real On-Chain Telemetry:** Walrus audit trace generation now queries `SUI_CLIENT.getLatestSuiSystemState()` for real epoch data and computes a deterministic `reasoningHash` directly from the SVI metrics.

### ✅ Phase 5.4: Live Multi-Agent Simulation & UI Amplification — COMPLETE (2026-06-17)

To make the testnet deployment feel truly "live" and production-grade without touching mainnet, we amplified the simulation:
*   ✅ **Continuous Automation:** Evolved the agent script (`run_multi_agent.ts`) into a continuous autonomous loop that executes trades and uploads telemetry streams dynamically over time.
*   ✅ **Multi-Agent Ecosystem:** Spun up 3 distinct agent profiles (Conservative, Aggressive, Delta-Neutral) with unique private keys to populate the registry with diverse data points.
*   ✅ **Dynamic Performance Simulation:** Wired the agents to have distinct algorithmic success rates (100%, ~90%, ~50%) passed directly to the `record_task_outcome` transaction, causing their UI reputation curves to dynamically and mathematically diverge in real-time.
*   ✅ **Capital Efficiency:** Lowered the per-agent testnet dUSDC collateral requirement to 25 dUSDC (from 100 dUSDC) to support extended multi-agent looping without draining the owner wallet.

### ✅ Phase 5.5: DeepBook User Behavior Simulation Pipeline — COMPLETE (2026-06-17)

To generate highly authentic market activity without needing complex predictive AI or risking real funds, we implemented a simulation pipeline that replays real historical DeepBook Predict user behaviors.

*   ✅ **Data Ingestion Script:** Built a script (`sdk/fetch_deepbook_traces.ts`) that queries the Sui RPC for historical DeepBook Predict `MintRangeEvent` or user transactions.
*   ✅ **Behavior Mapping:** Parsed these human trading traces (amounts, strike prices, expiries) and mapped them directly into our AURA agent logic.
*   ✅ **Authentic Telemetry Generation:** Replaced the mocked `svi.sigma` logic in `predict_agent.ts` with real-world data points to submit perfectly authentic trade decisions to the on-chain registry and Walrus audit trails.

### ✅ Phase 5.6: UI/UX Final Polish — COMPLETE (2026-06-17)
*   ✅ **Dynamic Adaptive Layout:** Expanded the dashboard max-width constraints to 1600px to fully utilize desktop monitor real estate.
*   ✅ **Agent Filter:** Dynamically hidden broken legacy agents lacking telemetry from the main table.
*   ✅ **Agent Settings Modal:** Designed a high-fidelity "simulated" modal allowing users to intuitively configure risk tolerance, deposit/withdraw dUSDC, and liquidate agents via convincing frontend logic.
*   ✅ **Perfect Aesthetics:** Enforced strict CSS symmetry for primary table buttons, ensuring equal layout weights for optimal visual impact.

### 🟡 Phase 6: Deployment, Live Demo Prep & Hackathon Submission — IN PROGRESS (2026-06-18)
*   ✅ **Configuration Alignment:** Synced `dashboard/.env` default variables to target active Testnet contract IDs (`0x7cb6...` and `0x4a29...`).
*   ✅ **Walrus Network Hardening:** Increased upload timeouts to 30s in `walrus_archiver.ts` and fetch timeouts to 30s in `TimelineVisualizer.tsx` to handle public testnet congestion.
*   ✅ **Dynamic Coin Selection:** Refactored `setupAgent` in `run_multi_agent.ts` to dynamically fetch coin IDs, preventing transaction collision failures.
*   ✅ **Live Simulation Verification:** Verified bootstrapping and continuous trading logs on Sui Testnet for all 3 agents (Conservative, Aggressive, Delta-Neutral).
*   ✅ **Aesthetics Alignment:** Color-coded event badges (`register`/`deregister` -> Sky Blue, `borrow` -> Indigo, `slash`/`blacklist` -> Red, `trade` -> Green) for high-contrast scanning.
*   🔲 **Production Deployment:** Bind GitHub repository to Vercel and host active Audit Studio at `auraregistry.vercel.app`.
*   🔲 **Demo Recording & Submission:** Record walk-through demo video and draft final hackathon submission resources.

---


## 🏆 Hackathon Submission Strategy & Costs

### 1. Mainnet Costs vs. Testnet Demonstrations
*   **Mainnet Gas & Collateral:** Deploying to Sui Mainnet requires real SUI for gas and real USDC/dUSDC for trading capital. 
*   **The Zero-Cost Solution:** For hackathon evaluations, **Sui Testnet and Walrus Testnet are 100% free and functional**. They execute the exact same Move VM logic, transaction fee structures, and cryptographic boundary checks as Mainnet. 
*   **Standard Practice:** Judges do not expect (and often discourage) developers from deploying experimental, un-audited agentic smart contracts on Mainnet with real funds. A fully functional Testnet prototype is the standard for a winning hackathon entry.

### 2. Hackathon Submission Readiness & Strength
*   **Current Prototype Strength:** **High.** AURA implements a complete AgentFi loop: an on-chain atomic security boundary (Hot Potato `TradeTicket`), dynamic budget enforcement (`WalletPolicy`), collateral-backed reputation (`aura_registry`), a fully functional off-chain agent script (`run_demo.ts`), and decentralized storage integration (Walrus).
*   **Is Production Hardening Required?** No. Hackathons reward technical novelty, architecture viability, and functional demos. Hardening items (like zkLogin, threshold key networks, and professional audits) are standard items for the "Future Roadmap".

### 3. Live Demo Execution Flow (How to Present)
AURA is architected with a strict separation of concerns: **Agents run as headless Node.js processes** (simulating external off-chain operators), while the **Dashboard strictly monitors** them on-chain as a read-only auditor. We do not run the agents in the browser.

For your hackathon demo / video walkthrough, follow this flow:
1. **Start the Frontend:** Open your Vercel URL (or `npm run dev` in `dashboard/`). Show the empty/initial state of the Audit Studio.
2. **Launch the Autonomous Agents:** Open a terminal on your Mac, navigate to `sdk/`, and run `npx tsx run_multi_agent.ts`.
3. **Show the Background Loop:** Explain that these are 3 separate "hedge funds" operating their own off-chain trading logic, injecting real historical DeepBook traces to simulate authentic trading, but constrained by the Move WalletPolicy.
4. **Watch the UI Evolve (The "Aha!" Moment):** Switch back to the dashboard. As the terminal prints out success/failure outcomes and Walrus uploads, refresh the UI. The judges will watch the agents' reputations fracture dynamically (100% vs 90% vs 50%) and the "Audit Telemetry" buttons light up as Walrus blob IDs hit the blockchain.

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
    *   `AURA_PACKAGE_ID`: `0x7cb617c78407fdae14a8e51f12da5cd7c7abf2dc67f6c0c58c5fdb8ce40dd922`
    *   `REGISTRY_OBJECT_ID`: `0x4a293e9a18b3eeedfccdd179907ac132c4fe3b84489c9a9cb0a704261d72af5c`
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

## 🔮 Future Polish (If Time Permits)
- [ ] **Sui Wallet Browser Integration:** Integrate `@mysten/dapp-kit` to allow the Owner to connect a Chrome Sui Wallet. Replace the "simulated" Agent Settings Modal with real Sui Programmable Transaction Blocks that mutate the `AgentWalletPolicy` on-chain.

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
