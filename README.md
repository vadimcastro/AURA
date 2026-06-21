# AURA — Autonomous Utility & Reputation Architecture

> A Sui-native reputation routing, policy-enforced wallet, and verifiable memory auditing protocol for autonomous trading agents executing on DeepBook Predict.

---

## The Problem

AgentFi introduces a fundamental tension: **how do you delegate financial execution to autonomous code without exposing the user to total capital loss, fraud, or untrustworthy agents?**

Today, autonomous trading agents on-chain face three unsolved problems:
1. **Unconstrained execution** — agents with key access can drain wallets to arbitrary addresses
2. **No skin in the game** — agent operators risk nothing when their bots lose user funds
3. **Opaque reasoning** — users can't verify *why* an agent made a specific trade

AURA solves all three with a protocol-level architecture built on Sui Move primitives.

---

## Architecture

```text
  [ USER (zkLogin) ] ──► Deploy/Configure Policy ──► [ MOVE POLICY WALLET ]
                                                              │
                                                              ▼ (Atomic PTB Ticket Checks)
  [ DEEPBOOK PREDICT ] ◄──── Autonomously Trade ◄───── [ AURA REGISTRY ]
          │                                           (Stake Bond Check)
          ▼ (Event Emission)                          │
  [ WALRUS DECENTRALIZED DATA ] ◄── Archive Audits ───┘
```

### Three Decoupled Layers

| Layer | Module | Purpose |
|---|---|---|
| **Execution Boundary** | `agent_wallet_policy.move` | Policy-enforced wallet using a Hot Potato / TradeTicket pattern. Funds can only flow to allowlisted contracts within atomic PTBs. |
| **Incentive Alignment** | `aura_registry.move`, `agent_nft.move` | Reputation registry with SUI stake bonds, optimistic slashing dispute games, and AgentNFT Kiosk wrapping. |
| **Telemetry & Audit** | `walrus_archiver.ts` | Seal-encrypted audit traces archived to Walrus, with `blob_id` committed on-chain for verifiable history. |

---

## Key Features

- **🔒 Hot Potato Trade Tickets** — Agent borrows funds via `borrow_for_trade`, receives a `TradeTicket` (no abilities), must return it via `return_and_complete` in the same PTB. Funds physically cannot leave the approved execution path.

- **💰 Budget Ceiling & Safety Floor** — Per-policy `budget_limit` caps cumulative spend. `min_balance_floor` prevents over-commitment. Clamped subtraction handles profitable trades without underflow.

- **🔥 Deflationary Buy/Burn Insurance** — Implements a 0.5% fee on profitable options executions inside `agent_wallet_policy.move` routed directly to `@buy_and_burn_insurance`, executing a twin function of deflationary token value capture and a slashing insurance backstop for high-reputation operators.

- **🗜️ Verifiable State History Compression** — Aggregates raw Walrus telemetry logs periodically (every 5 cycles) into a dense, encrypted "Strategy Summary String" on Walrus to prevent LLM context window overflow while preserving long-term memory.

- **🧠 Hybrid Validator-Consensus Pattern** — Employs a dual-layer AI strategy: a lightning-fast `google/gemma-4-26b-a4b-it:free` "Grunt" executor running under a deterministic TypeScript Sanity Sandbox, combined with an off-chain background "Thinker" Panel consensus trio (`nvidia/nemotron-3-ultra-550b-a55b:free`, `qwen/qwen3-coder:free`, and `meta-llama/llama-3.3-70b-instruct:free`) periodically summarizing historical Walrus traces to update strategy prompts off the live trading path.

- **📊 Optimistic Slashing Dispute Game & Encrypted Auditing** — Resolves disputes trustlessly using cryptoeconomics:
  * **Encrypted Telemetry:** Agent mind-trails are encrypted client-side via AES-256-GCM (Seal) and uploaded to Walrus, ensuring strategies remain confidential. Only public transaction outputs are visible by default.
  * **Filing a Challenge:** Any user can file a dispute against a telemetry `blob_id` by locking a **0.01 SUI challenge bond** (reflected in the `Dispute Escrow` on-chain, which reads `0 SUI` by default when no disputes are active).
  * **The 24h Disclosure Window:** The challenged operator **must** post the decryption key on-chain within 24 hours via `disclose_telemetry_key`. 
  * **Resolution Outcome:**
    * **If they disclose:** The key becomes public, allowing anyone to decrypt and audit the Walrus payload in browser memory. The challenger is refunded their 0.01 SUI.
    * **If they fail to disclose:** The agent is deemed malicious. The smart contract slashes the agent's performance bond (e.g. 0.1 SUI) and awards it directly to the challenger as a bounty!

- **🏬 Sui Kiosk Strategy NFT wrapping** — High-performing strategy records and reputations can be packaged into an `AgentNFT` containing snapshots of the agent's exact model/orchestration parameters, then placed in a shared `sui::kiosk::Kiosk` to create a tradeable marketplace with high switching costs.

- **🔐 Seal-Encrypted Audit Trails** — Trade reasoning is encrypted client-side via Seal, uploaded to Walrus, and the `blob_id` is committed on-chain. Disputes trigger decryption for verification.

- **🌐 Hybrid Onboarding (dApp-kit)** — Combines browser extension wallets (Backpack/Sui Wallet) via standard `@mysten/dapp-kit` context providers with Web2 social zkLogin (Google, GitHub) fallback.

- **⏰ Expiration & Revocation** — Policies expire by epoch. Owner can `revoke_policy` at any time, destroying the shared object and reclaiming all funds.

- **📡 Full Event Emission** — Every state change emits a structured event for indexing, monitoring, and the Walrus archiver pipeline.

---

## Repository Structure

```
AURA/
├── README.md                          # This file
├── docs/
│   ├── SPECIFICATION.md               # Full technical specification
│   ├── ROADMAP.md                     # Phased execution plan + dependencies
│   ├── EDGE_CASES.md                  # Failure modes & resolution strategies
│   └── LIFECYCLE_AND_CONSENSUS.md     # Agent lifecycle, LLM consensus judges, & math

├── contracts_sui/
│   ├── Move.toml
│   └── sources/
│       ├── agent_wallet_policy.move   # Policy wallet + TradeTicket
│       ├── aura_registry.move         # Reputation registry + slashing
│       └── agent_nft.move             # Strategy NFT wrappers & Kiosk trade
├── dashboard/                         # React/Vite Audit Studio + Onboarding Dock UI
└── sdk/
    ├── predict_agent.ts               # DeepBook Predict trading loop
    ├── walrus_archiver.ts             # Seal encryption + Walrus upload
    └── config.ts                      # Testnet addresses + env config
```

---

## Sui Ecosystem Integration

| Technology | Usage |
|---|---|
| **Sui Move** | Policy wallet, reputation registry, on-chain state |
| **Programmable Transaction Blocks (PTBs)** | Atomic multi-step trade execution |
| **zkLogin** | Social authentication for user onboarding |
| **Sui Kiosk** | Algorithmic strategy NFT listing and trade platform |
| **Sui Name Service (SuiNS)** | Readable name resolver for agent profiles |
| **DeepBook Predict** | Volatility-surface-priced prediction market (SVI oracle) |
| **Walrus** | Decentralized verifiable storage for audit trails |
| **MemWal** | Persistent agent memory layer on Walrus |
| **Seal** | Client-side threshold encryption for private audit data |

---

## Quick Start

> **Prerequisites:** Sui CLI ≥ 1.x, Node.js ≥ 18, `@mysten/sui` SDK

```bash
# Clone and install
git clone https://github.com/vadimcastro/AURA
cd AURA

# Build Move contracts
cd contracts_sui
sui move build
sui move test

# Deploy to testnet
sui client publish --gas-budget 100000000

# Run the agent (after configuring .env)
cd ../sdk
npm install
npx ts-node predict_agent.ts

# Run the React/Vite Audit Studio Dashboard
cd ../dashboard
npm install
npm run dev
```

### ⚙️ Live Walkthrough Progression
To test the complete end-to-end AURA setup:
1. **Start Server:** Start the off-chain daemon runner (Vite dashboard's Operator tab or `npm run runner` inside `/sdk`).
2. **Register Agent:** Register a new autonomous agent via the dashboard Directory tab to post SUI collateral stake.
3. **Prompt Engine Trade:** Input natural language queries into the Intent Engine tab to mint option ranges on DeepBook.
4. **Configure & Audit:** Ingest telemetry summaries, decrypt mind trails, and adjust risk policies under the Audit Studio.

---

## Documentation

- **[Technical Specification](file:///Users/vadim/Desktop/AURA/docs/SPECIFICATION.md)** — Full protocol engineering spec including Move contracts, TypeScript SDK, and Walrus archiver
- **[Roadmap & Dependencies](file:///Users/vadim/Desktop/AURA/docs/ROADMAP.md)** — Phased execution plan with toolchain versions
- **[Edge Cases & Failure Modes](file:///Users/vadim/Desktop/AURA/docs/EDGE_CASES.md)** — Flash crash protection, oracle staleness, gas exhaustion, key compromise
- **[Sui CLI Command Guide](file:///Users/vadim/Desktop/AURA/docs/SUI_COMMANDS.md)** — Verified commands for environment setup, compilation, and protocol calls
- **[Sui Commands Developer Skill](file:///Users/vadim/Desktop/AURA/skills/sui-commands/SKILL.md)** — Developer instructions, SDK patterns, and Move VM troubleshooting lessons

---

## Ecosystem Alignment

AURA is designed to align with and contribute across multiple Sui ecosystem tracks:

| Track | Alignment |
|---|---|
| **Agentic Web → Autonomous Agent Wallet** | Primary — AURA is the ultimate *Autonomous Agent Wallet* utilizing the Hot Potato `TradeTicket` pattern to enforce policy budgets, delegating secure execution boundaries to third-party scripts. |
| **DeFi & Payments** | Strong — programmable financial workflows via PTB-atomic trade execution and fee mechanics. |
| **Walrus** | Strong — verifiable long-term agent memory with Seal encryption, including Reflective Memory loops for dynamic strategy optimization and Crash-Recovery State Machines. |
| **DeepBook Predict** | Supporting — volatility-aware trading strategy backed by verifiable `OracleSVI` calculations logged in audit traces to prove active volatility-surface pricing. |

---

## License

MIT
