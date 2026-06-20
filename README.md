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

- **📊 Optimistic Slashing Dispute Game** — Replaces trusted admin slashing. Users submit disputes by locking a dispute bond. Operators must disclose the decryption key within 24 hours. Failure automatically slashes the operator's performance bond and awards it to the challenger.

- **🏬 Sui Kiosk Strategy NFT wrapping** — High-performing strategy records and reputations can be packaged into an `AgentNFT` and placed in a shared `sui::kiosk::Kiosk`, enabling secure strategy renting and tradeable algorithms.

- **🔐 Seal-Encrypted Audit Trails** — Trade reasoning is encrypted client-side via Seal, uploaded to Walrus, and the `blob_id` is committed on-chain. Disputes trigger decryption for verification.

- **🌐 Hybrid Onboarding (dApp-kit)** — Combines browser extension wallets (Backpack/Sui Wallet) via standard `@mysten/dapp-kit` context providers with Web2 social zkLogin (Google, GitHub, Apple) fallback.

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
│   └── EDGE_CASES.md                  # Failure modes & resolution strategies
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
