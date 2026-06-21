# Getting Started & Developer Setup

This guide provides instructions for setting up the local AURA development environment, managing test wallets, running the multi-agent simulator, and performing live audit demos.

---

## 1. Dev Environment Status

> Last verified: 2026-06-20

| Item | Status | Detail |
|---|---|---|
| **Sui CLI** | ✅ Installed | `sui 1.73.1-ff1fe0ec4551` |
| **Active Network** | ✅ Testnet | `sui client active-env` → `testnet` |
| **Active Address** | ✅ Configured | `0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676` |
| **Testnet SUI Balance** | ✅ Funded | **4.86 SUI** (Gas remaining for operations) |
| **Testnet WAL Balance** | ✅ Funded | **0.50 WAL** (Telemetry storage allocation) |
| **Testnet dUSDC Balance** | ✅ Funded | **925.00 DUSDC** (Capital funding for agent policies) |
| **Node.js** | ✅ Installed | Verified Node.js v18+ environment |
| **`@mysten/sui` SDK** | ✅ Installed | Core SDK package installed in `/sdk/` |

---

## 2. Wallet Profiles

*   **Owner Address:** `0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676`
*   **Role:** Instantiates agents, funds initial capital policies, manages risk rules, and triggers Sweeps/Liquidations.
*   **Asset Distribution:**
    *   `SUI` (Gas Coin): Pays transaction execution fees (except sponsored transactions).
    *   `WAL` (Walrus Coin): Pays for decentralized storage writes to host telemetry logs.
    *   `dUSDC` (Trading Capital): Deposited into `WalletPolicy` objects to fund DeepBook Predict trade executions.

---

## 3. Managing the Agent Roster

1.  **Resetting Agents (Clean State):**
    To wipe the dynamic registry and start fresh with zero active agents:
    *   Delete or empty `Published.toml` inside `contracts_sui/`.
    *   Republish contracts: `sui client publish --skip-dependency-verification`
    *   Copy the fresh `Package ID` and `Registry ID` into `dashboard/.env` and `sdk/.env`.
2.  **Telemetry-Only Filter:**
    In a demonstration sandbox, some registered agents might not have completed active cycles yet. To filter out legacy or inactive agents on the dashboard, the directory components apply a React filter to display only agents containing a valid `latestBlobId`.

---

## 4. Evaluation Strategy & Testing Costs

### Mainnet Costs vs. Testnet Demonstrations
*   **Mainnet Constraints:** Deploying to Sui Mainnet requires real-value capital. 
*   **Zero-Cost Verification:** Sui Testnet and Walrus Testnet are **100% free and functionally identical**. They execute the same Move VM bytecode, emit the same events, and enforce the same security boundaries (e.g. Hot Potato ticket returns) as Mainnet.

### Live Demo Execution Flow (Step-by-Step)
AURA separates off-chain agent processing from audit monitoring: **Agents run as headless processes** (Node.js daemons), while the **Vite Dashboard monitors on-chain states** as a read-only auditor.

For a live demo walkthrough:
1.  **Boot the Dashboard:** Start the frontend app (`npm run dev` in `dashboard/`) and load the empty Audit Studio state.
2.  **Start the Daemon:** Navigate to `sdk/` and run:
    ```bash
    npm run runner
    ```
3.  **Audit the Timeline:** Observe the dashboard update in real-time. As the keeper daemon queries the SVI oracle and submits PTBs, the table displays updated PnL, reputations fracture dynamically, and the timeline visualizer lights up with Walrus telemetry decryption triggers.

---

## 5. CLI Reference Guides
For detailed CLI commands regarding Move compilation, testnet faucet requests, object inspection, and Walrus WAL conversions, see the complete guide:
👉 **[Sui CLI Command Guide](file:///Users/vadim/Desktop/AURA/docs/SUI_COMMANDS.md)**
