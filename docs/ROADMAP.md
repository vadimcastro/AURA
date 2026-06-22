# AURA Project Roadmap & Execution Plan

**Progress: [██████████████████░░] 90% Complete (9/10 Phases Completed) — Phase 9 V4 Production Architecture & Advanced Orchestration completed, Phase 10 Live Walkthrough Demo & Submission planned**

---

## Phased Execution Plan

```text
 PHASE 1 (Move Contracts) ──► PHASE 2 (TS SDK) ──► PHASE 3 (Integration) ──► PHASE 4 (Testnet Deploy)
                                                                                  │
 PHASE 8 (Hardening)      ◄── PHASE 7 (zkLogin) ◄── PHASE 6 (Prod Deploy) ◄───────┘
          │
          ▼
 PHASE 9 (Validator Consensus) ──► PHASE 10 (Live Demo Submission)
```

### ✅ Phase 1: Move Core Contracts — COMPLETE (2026-06-16)
*   ✅ Wrote `aura_registry.move` and `agent_wallet_policy.move` under `contracts_sui/sources`.
*   ✅ Implemented all core functions: `create_policy`, `deposit`, `delegate_budget`, `borrow_for_trade`, `return_and_complete`, `revoke_policy`, `register_agent`, `withdraw_excess_stake`, and progressive reputation metrics.
*   ✅ 15/15 Move unit tests passing — zero errors, zero warnings (`sui move build && sui move test`).

### ✅ Phase 2: Off-Chain TypeScript SDK — COMPLETE (2026-06-16)
*   ✅ Built `predict_agent.ts` with SVI parameter checks, time freshness assertions, and full PTB construction.
*   ✅ Built `walrus_archiver.ts` with client-side simulated Seal encryption (AES-256-GCM) and Walrus publisher uploader.
*   ✅ 38/38 unit & integration tests passing with ESM/NodeNext compilation.

### ✅ Phase 3: Protocol Integration — COMPLETE (2026-06-17)
*   ✅ Resolved DeepBook Predict testnet package and `mint_range` function signatures.
*   ✅ Built `MemWalClient` with dynamic fallback cache for persistent telemetry logs.
*   ✅ Verified integration via comprehensive end-to-end simulation tests.

### ✅ Phase 4: Testnet Deploy & Demo — COMPLETE (2026-06-17)
*   ✅ Published Move contracts to Sui Testnet. Package ID: `0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef`
*   ✅ Shared Registry Object ID: `0x458bbc14f6fb58c8ba460e5167349602d5d368f354c843b310320682881f31d7`
*   ✅ Executed the complete successful options trading and telemetry-archiving cycle on Sui Testnet (Success Path Tx Digest: `96ggfYP8LDfDQajgur4MD6AhUVEEZFzgPavNGdrp5hiR`).
*   ✅ Verified all adversarial scenarios (budget ceiling, expired policy, unauthorized agent, admin slashing) correctly reverting on-chain.

### ✅ Phase 5: Visual Audit Studio Dashboard — COMPLETE (2026-06-17)
*   ✅ Scaffolded a modern React + TypeScript + Tailwind CSS application in `dashboard/`.
*   ✅ Implemented real-time on-chain data retrieval from Sui Testnet mapping registered agents.
*   ✅ Built an interactive visual timeline resolving and fetching encrypted Seal envelopes from Walrus Testnet.
*   ✅ Implemented client-side AES-GCM decryption in browser memory using Web Cryptography API.

### ✅ Phase 6: Production Deployment & Live Simulation — COMPLETE (2026-06-18)
*   ✅ **Configuration Alignment:** Synced `dashboard/.env` default variables to target active Testnet contract IDs.
*   ✅ **Live Simulation Verification:** Verified bootstrapping and continuous trading loops on Sui Testnet for all 3 agents (Conservative, Aggressive, Delta-Neutral).
*   ✅ **Production Deployment:** Bound GitHub repository to Vercel and successfully hosted the active Audit Studio.

### ✅ Phase 7: Sui Native Infrastructure & zkLogin — COMPLETE (2026-06-19)
*   ✅ **Sui Name Service (SuiNS)**: Integratedreverse-lookup APIs in the dashboard to resolve domains (e.g. `trader.sui`).
*   ✅ **Sui zkLogin**: Configured social authentication integrations (Google, GitHub) for gasless Web2 onboarding.
*   ✅ **Sui Kiosk**: Bound agent strategy wrappers to `AgentNFT` kiosk records.
*   ✅ **Paymaster Sponsorship:** Implemented a secure off-chain paymaster transaction sponsorship endpoint in the operator daemon.

### ✅ Phase 8: Protocol Hardening & Cryptoeconomic Alignment — COMPLETE (2026-06-19)
*   ✅ **Asymmetric Risk Ratios**: Restructured registry parameters to enforce a 10:1 Agent Stake to Dispute Bond ratio to prevent griefing.
*   ✅ **Reputation-Based Stake Releases**: Added `withdraw_excess_stake` allowing operators to progressively unlock locked SUI stake as reputation score increases.
*   ✅ **Deflationary Value Capture**: Added a 0.5% protocol profit fee inside Move routed directly to the treasury buy-and-burn modules.
*   ✅ **Durable State Resilience:** Coded idempotency checks, process circuit breakers, and reflective memory buffers to gracefully handle network issues and gas depletion.

### ✅ Phase 9: V4 Production Architecture & Advanced Orchestration — COMPLETE (2026-06-21)
*   ✅ **Gemma 4 Grunt Executor:** Integrated `google/gemma-4-26b-a4b-it:free` for fast-path option evaluation under a strict pre-sign sanity sandbox.
*   ✅ **Consensus Thinker Judge Panel:** Implemented a background 3-model judge consensus panel (`Nemotron`, `Qwen3`, `Llama-3.3`) off the live trading loop.
*   ✅ **DecisionBench Emergent Delegation:** Handled automatic fallback paths to Nemotron-3-Ultra on Grunt failures, with human-in-the-loop escalations.
*   ✅ **Stripe Crypto Onramp Funding Portal**: Integrated the Stripe Crypto Onramp widget into the dashboard configuration modal, supported by a secure backend creation endpoint using private keys.
*   ✅ **V4 Hardening & UX Polish**:
    *   *Stripe Version Pinning:* Fixed post session failures on older dev accounts by pinning the `Stripe-Version: 2022-11-15` header.
    *   *Parallelized Consensus:* Leveraged `Promise.all` for off-loop thinker queries to minimize audit latency.
    *   *Model Fallback Chain:* Added resilient upstream model transitions (`Gemma-4` -> `Qwen-3 Coder` -> `Nemotron-3-Ultra`) under high-load API rate limits.
    *   *Live signed PTB execution:* Integrated on-chain PTB construction and browser-wallet signature requests into the Intent Engine interface.
    *   *UX testing links:* Placed Sui Testnet Faucet and Cetus DEX swap buttons directly under the wallet address to simplify token setup.
    *   *Anti-Flicker:* Gated the UI loading spinner states to eliminate layout shifts during periodic dashboard polls.
    *   *Client-Side Backup Parser:* Implemented regex-based local fallback in the Intent Engine when the backend AI API is offline or rate-limited.
    *   *Visual System Lifecycle Guide:* Added a top-bar banner to clarify the sequence (`Start Server -> Register Agent -> Prompt Trade -> Configure/Audit`).
    *   *Strike Price Normalization:* Built scaling normalizers on both frontend and backend to auto-convert decimal strikes (e.g. `6.5` -> `65000`) for DeepBook options.
    *   *Tight Loop Execution Control:* Modified `/api/start` to bootstrap agent policies and enable daemon status without launching background loops, giving the operator manual control via "Run Loop" or "Step" directory triggers.

---

## 🚀 Phase 10: Live Walkthrough Demo & Submission — PLANNED

*   🔲 **Walkthrough Video Recording**: Record the live walkthrough demo video showcasing browser zkLogin registration, copy-trading loops, paymaster gas sponsorship, and Stripe funding.
*   🔲 **Cloud-Only Demo Strategy (Vercel + Railway Service Toggle)**:
    *   **Deployment Setup:** Deploy the off-chain SDK bot runner folder to Railway. Configure the required environment variables inside the Railway console.
    *   **Gas Preservation State:** Keep the Railway service **paused** by default to prevent testnet gas and faucet depletion.
    *   **Execution:** When presenting or recording the walkthrough, click **Resume** inside the Railway control panel. The cloud worker will boot, run active trades on DeepBook, and log telemetry. 
    *   **Cleanup:** Click **Pause** in Railway once the demo concludes.
*   🔲 **Final Release Compilation**: Package the final release assets, links to the Vercel dashboard, GitHub repository, and video walk-through.

---

## 🛡️ Production Hardening Tasks (Pending for Future Prod-Grade Release)

*   **Stripe Onramp KYC/Compliance Activation:** Submit the formal merchant onboarding application and allowlist live production domains in the Stripe console to transition the completed onramp integration from sandbox/testmode to live payments (post-hackathon due to the 48-hour merchant approval cycle).
*   **Real DeepBook Predict Mainnet Integration:** Transition from the testnet mock pool to direct mainnet integration with DeepBook Predict contracts.
*   **Threshold Key Infrastructure (Seal SDK):** Migrate from mock local AES encryption to real distributed threshold keys derived from policies to encrypt and decrypt Walrus telemetry logs.
*   **Authorized MemWal Integration:** Authenticate the off-chain bot via a valid MemWal token instead of the playground fallback.
*   **Formal Security Audit:** Conduct a formal audit of Move smart contracts, specifically using the Move Prover to verify that the `TradeTicket` hot potato cannot be dropped or copied under any circumstances.
*   **Sui Display Metadata Mapping (agent_nft.move):** Implement OTW (One-Time Witness) publishing and register the `sui::display::Display<AgentNFT>` properties on-chain so that wallets like Slush can natively render Strategy NFTs as rich visual cards, including reputation scores, model descriptors, and direct link bindings.
*   **Kiosk Leasing Extension (aura_kiosk_leasing.move):** Build an on-chain leasing system using Sui Kiosk Extensions. Allows leasers to lock their Strategy NFTs inside their Kiosk while granting temporal borrow authority to third-party renters in exchange for recurring dUSDC fees.

---

## Dependency & Toolchain Table

| Dependency | Version / Reference | Purpose |
|---|---|---|
| Sui CLI | `1.73.1` | Contract compilation, publishing, and testnet interaction |
| Move Edition | `edition = "2024.beta"` | Enables `public(package)` and modern struct field syntax |
| `@mysten/sui` | `^2.19.0` | TypeScript SDK for PTB construction and RPC queries |
| `@mysten/dapp-kit` | `^1.1.1` | React components and hooks for standard browser wallets connection |
| Sui Testnet RPC | `https://fullnode.testnet.sui.io:443` | Fullnode endpoint for JSON-RPC transport |
| DeepBook Predict | Branch `predict-testnet-4-16` | Predict protocol contracts on testnet |
| Predict Server | `https://predict-server.testnet.mystenlabs.com` | SVI oracle endpoint |
| dUSDC Faucet | [Tally Form](https://tally.so/r/Xx102L) | Request testnet dUSDC tokens |
| Walrus Publisher | `https://publisher.walrus-testnet.walrus.space` | Blob upload endpoint |
| Walrus Aggregator | `https://aggregator.walrus-testnet.walrus.space` | Blob retrieval endpoint |
| MemWal Playground | MemWal Walrus Memory docs | Delegated key auth for persistent agent storage |
| Seal | Seal docs / SDK | Client-side threshold encryption for audit traces |
