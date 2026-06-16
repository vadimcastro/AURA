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
| **Incentive Alignment** | `aura_registry.move` | Reputation registry with SUI stake bonds, on-chain performance tracking, and admin-gated slashing. |
| **Telemetry & Audit** | `walrus_archiver.ts` | Seal-encrypted audit traces archived to Walrus, with `blob_id` committed on-chain for verifiable history. |

---

## Key Features

- **🔒 Hot Potato Trade Tickets** — Agent borrows funds via `borrow_for_trade`, receives a `TradeTicket` (no abilities), must return it via `return_and_complete` in the same PTB. Funds physically cannot leave the approved execution path.

- **💰 Budget Ceiling & Safety Floor** — Per-policy `budget_limit` caps cumulative spend. `min_balance_floor` prevents over-commitment. Clamped subtraction handles profitable trades without underflow.

- **📊 On-Chain Reputation** — Agents stake SUI, performance is tracked via `record_task_outcome`, reputation score is calculated as `(successful / total) × 10^6`. Slashing is admin-gated (DAO/arbiter).

- **🔐 Seal-Encrypted Audit Trails** — Trade reasoning is encrypted client-side via Seal, uploaded to Walrus, and the `blob_id` is committed on-chain. Disputes trigger threshold decryption for verification.

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
│       └── aura_registry.move         # Reputation registry + slashing
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
| **zkLogin** | User authentication for policy management |
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
```

---

## Documentation

- **[Technical Specification](docs/SPECIFICATION.md)** — Full protocol engineering spec including Move contracts, TypeScript SDK, and Walrus archiver
- **[Roadmap & Dependencies](docs/ROADMAP.md)** — Phased execution plan with toolchain versions
- **[Edge Cases & Failure Modes](docs/EDGE_CASES.md)** — Flash crash protection, oracle staleness, gas exhaustion, key compromise

---

## Hackathon Tracks

AURA is designed to contribute across multiple Sui hackathon tracks:

| Track | Alignment |
|---|---|
| **Agentic Web → Autonomous Agent Wallet** | Primary — policy-enforced delegation, budget ceiling, on-chain activity log, owner revocation |
| **DeFi & Payments** | Strong — programmable financial workflows via PTB-atomic trade execution |
| **Walrus** | Strong — verifiable long-term agent memory with Seal encryption |
| **DeepBook Predict** | Supporting — SVI oracle integration, volatility-aware trading strategy |

---

## License

MIT
