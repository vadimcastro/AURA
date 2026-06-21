# Getting Started & Developer Setup

This guide provides instructions for setting up the local AURA development environment, managing test wallets, running the multi-agent simulator, and performing live audit demos.

---

## Sui Hackathon Track: Agentic Web
AURA is submitted under the **Agentic Web** track. It represents the strongest fit for this track due to its core architectural alignment:
* **Sub-track 2 (Autonomous Agent Wallet):** AURA implements on-chain `WalletPolicy` modules in Move. Liquidity Providers (LPs) and owners delegate trading capital directly to autonomous agents under strict constraints (drawdown ceilings, allowlisted smart contract packages, and expiration epochs) rather than sharing private keys, ensuring robust, decentralized asset control.
* **Sub-track 3 (Intent Engine):** AURA includes a natural-language Intent Engine that translates user requests into execution paths (Programmable Transaction Blocks) on-chain, utilizing a mathematical safety sandbox and slippage/gas guardrails.

---

## 1. Dev Environment Status

> Last verified: 2026-06-20

| Item | Status | Detail |
|---|---|---|
| **Sui CLI** | Installed | `sui 1.73.1-ff1fe0ec4551` |
| **Active Network** | Testnet | `sui client active-env` -> `testnet` |
| **Active Address** | Configured | `0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676` |
| **Testnet SUI Balance** | Funded | **4.86 SUI** (Gas remaining for operations) |
| **Testnet WAL Balance** | Funded | **0.50 WAL** (Telemetry storage allocation) |
| **Testnet dUSDC Balance** | Funded | **925.00 DUSDC** (Capital funding for agent policies) |
| **Node.js** | Installed | Verified Node.js v18+ environment |
| **`@mysten/sui` SDK** | Installed | Core SDK package installed in `/sdk/` |

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
*   **Zero-Cost Verification:** Sui Testnet and Walrus Testnet are 100% free and functionally identical. They execute the same Move VM bytecode, emit the same events, and enforce the same security boundaries (e.g. Hot Potato ticket returns) as Mainnet.

### Architectural Difference: Browser Simulation vs. On-Chain Daemon
AURA supports two distinct operational modes for demonstrating and executing options-trading agent cycles:

1. **Local Browser Simulation (Vite Dashboard):**
   * **Mechanics:** Triggered via the "Schedule Local Sim Loop" dropdown or the "Step" button on an agent card in the Agent Directory.
   * **Purpose:** Runs simulated trade decisions (Conservative, Balanced, Aggressive preset ranges) and logs telemetry results directly in the browser's local state.
   * **Why it is Simulated (Bypassing the Approve Wall):** Browser wallet extensions (e.g., Sui Wallet, OKX Wallet) enforce strict security boundaries, requiring manual user approval and popup clicks for every transaction signature. Since autonomous agents run continuous loops (every 10-30 seconds), running a true on-chain loop directly inside the browser would trigger a constant stream of wallet popups, making the interface unusable. The local simulation demonstrates the interface, strategy transitions, and telemetry flows without signature friction.

2. **Real On-Chain Daemon Loop (Headless CLI Bot Runner):**
   * **Mechanics:** Run the SDK CLI script `npm run multi-agent` inside the `/sdk/` directory.
   * **Purpose:** Executes genuine on-chain option mints, capital transfers, oracle parameter queries, and encrypted telemetry archiving to Walrus.
   * **How it Bypasses the Approve Wall:** The headless daemon runs as an off-chain Node.js server. It loads the agent's keypair directly in-memory and programmatically signs transactions, sending them directly to the Sui RPC nodes. 
   * **Capital Security Boundary:** Because the agent has direct key access to sign transactions programmatically, the owner protects their capital on-chain using a `WalletPolicy` object. The `WalletPolicy` restricts the agent's access to allowlisted trading contract packages (e.g., DeepBook Predict), enforces maximum drawdown ceilings, and imposes strict expiration times. Even if an agent's off-chain daemon key is compromised or the LLM hallucinates, it cannot drain the owner's primary wallet or trade unapproved assets.

---

## 5. Live Demo Execution Flow (Step-by-Step)

AURA separates off-chain agent processing from audit monitoring: Agents run as headless processes (Node.js daemons), while the Vite Dashboard monitors on-chain states as a read-only auditor.

> [!IMPORTANT]
> **Recommended Walkthrough Sequence:**
> ```text
> [1. Start Server] -> [2. Register Agent] -> [3. Run Loop / Step] -> [4. Prompt Intent] -> [5. Configure & Audit] -> [6. Dispute & Disclose]
> ```

For a live demo walkthrough, follow this exact progression:
1. **Start Server (Operator Console):** Boot the off-chain bot runner daemon. You can do this via the operator panel tab on the dashboard or by running `npm run runner` inside `/sdk/`.
2. **Onboard & Register Agent (Directory Tab):** Create and register a new autonomous agent node on-chain. This locks their SUI collateral in the shared registry and allocates their initial dUSDC strategy budget. The new node will now appear in the Agent Directory.
3. **Execute Real On-Chain Continuous Loops:**
   * Open your terminal and navigate to `/sdk/`.
   * Run the command: `npm run multi-agent`
   * This command programmatically registers three unique agents, creates their on-chain `WalletPolicy` objects, funds them, and runs actual options-pricing cycles on the Sui Testnet.
   * In your Vite Dashboard directory, you will see the telemetry timeline automatically update with real, non-mocked transaction events, and real PnL/balance changes fetched dynamically from the blockchain.
4. **Prompt Engine Trade (Intent Engine Tab):** Type a natural language options trading command. The Intent Engine parses this into an atomic Sui PTB transaction (e.g., DeepBook Range Mint) executing on behalf of your active session's policy wallet. *Note: Intent trades execute against existing policy wallets and do not create new directory agent nodes.*
5. **Configure / Audit Telemetry (Audit Studio Tab):** Select your active agent in the directory to inspect its Walrus audit history timeline, decode encrypted mind trails, and manually configure strategy rules or trigger liquidations.
6. **File Dispute & Auto-Disclose (Slashing Game Demo):**
   * **File a Challenge:** Select a telemetry transaction from the timeline and click the red **File Dispute** button. This submits a challenge on-chain and locks a `0.01 SUI` dispute bond from your connected browser wallet.
   * **Observe Auto-Disclosure:** In the running daemon server terminal (`npm run runner`), watch the background listener detect the dispute and automatically submit a `disclose_telemetry_key` transaction on-chain within 15 seconds to prove compliance.
   * **Verify Settlement:** Note that the locked `0.01 SUI` dispute bond is transferred directly to the operator's account as compensation for the privacy exposure. 
   * **Verify Telemetry Decryption:** In the dashboard timeline, the dispute status updates to **Resolved / Disclosed**. You can now click **Decrypt via Connected Daemon** to instantly decode and inspect the agent's internal reasoning.

---

## 6. CLI Reference Guides
For detailed CLI commands regarding Move compilation, testnet faucet requests, object inspection, and Walrus WAL conversions, see the complete guide:
👉 **[Sui CLI Command Guide](file:///Users/vadim/Desktop/AURA/docs/SUI_COMMANDS.md)**

