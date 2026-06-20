# Critical Edge Cases & Failure Modes

## A. The "Flash Crash / Sudden Liquidation" Risk
*   **The Issue:** An agent takes a leveraged Predict position, and a sudden market move triggers an on-chain liquidation before the agent can react.
*   **The Resolution:** The `WalletPolicy` enforces a `min_balance_floor` field. Every call to `borrow_for_trade` asserts that the post-borrow balance remains above this floor, preventing the agent from over-committing capital into illiquid positions. If a flash crash drains a position below the safety margin, the agent physically cannot open new trades until the balance recovers or the owner tops up via `deposit`. Additionally, the off-chain agent runs a pre-flight `dryRunTransactionBlock` check before every PTB submission to detect revert-risk before paying gas.
*   **Escalation Path:** If the agent's cumulative PnL breaches a configurable drawdown threshold (tracked off-chain), the off-chain keeper pauses the loop and emits a Walrus alert trace. The user can then invoke `revoke_policy` to reclaim remaining funds.

## B. Oracle Feeder Latency & Front-Running
*   **The Issue:** The Predict server lags or emits stale SVI parameters, allowing external searchers to front-run the agent's range adjustments.
*   **The Resolution:** Freshness is enforced at two layers:
    1.  **Off-chain (TypeScript agent):** Before constructing the PTB, the agent compares the SVI response's `timestamp` field against `Date.now()`. If the delta exceeds 15 seconds, the agent aborts and logs a stale-oracle event to Walrus.
    2.  **On-chain (Move contract):** If DeepBook Predict's oracle module exposes a `sui::clock::Clock`-based timestamp on its `OracleSVI` object, `borrow_for_trade` can accept a `&Clock` reference and compare `clock::timestamp_ms(clock)` against the oracle's last-update field. This provides a belt-and-suspenders guarantee that even a compromised off-chain agent cannot execute against stale data.

## C. Walrus Storage Gas Reservoir Exhaustion
*   **The Issue:** The agent runs out of SUI to pay for Walrus storage writes, causing execution traces to stop uploading, which triggers automatic slashing for audit failures.
*   **The Resolution:** The off-chain agent maintains a **gas budget monitor**: before each Walrus upload, it queries its own SUI balance and compares against a configurable minimum (e.g. 1 SUI). If the balance is insufficient, the agent halts the trading loop and logs a `GAS_EXHAUSTED` status to its last Walrus entry. The policy wallet's `min_balance_floor` provides a secondary on-chain guardrail — the agent cannot drain the wallet to zero to pay for gas, because `borrow_for_trade` will abort.

## D. Agent Key Compromise
*   **The Issue:** The agent's ephemeral hot key is leaked or stolen, allowing an attacker to execute trades within the policy bounds.
*   **The Resolution:** The blast radius is bounded by design: the attacker can only trade within the `budget_limit`, only against `allowed_contracts`, and only until `expiration_epoch`. The user can immediately call `revoke_policy` to destroy the policy and reclaim all funds. The short expiration window (typically 24h) limits the exposure period. Post-compromise, the user deploys a new policy with a fresh agent key.

## E. Staking, Deregistration, and Slashing Mechanics
*   **The SUI Stake Bond & Asymmetric Risk Ratio:** When an agent registers on the AURA Registry (`aura_registry.move`), they must lock a SUI stake bond. To prevent gridlock or economic exploitation, the Agent Stake must always be heavily disproportionate to the Dispute Bond (10:1 ratio). This ensures a lucrative reward for honest whistleblowers while charging a penalty that exceeds the cost of disputing.
    *   **Testnet Targets:** Minimum stake is **0.1 SUI** (100,000,000 MIST) and the dispute bond is **0.01 SUI** (10,000,000 MIST). This keeps SUI requirements low enough to avoid testnet faucet exhaustion while preserving the 10:1 economic ratio.
    *   **Mainnet Targets:** The Agent Stake is set dynamically to **5% of the WalletPolicy's TVL** (or a 500 SUI minimum), and the Dispute Bond is **0.5% of the TVL** (or 50 SUI).
*   **Voluntary Deregistration:** If an agent wishes to exit the system (e.g., they have completed their trading lifecycle and earned high reputation), they call `deregister_agent()`. This returns the entire SUI stake bond back to the agent's hot-key address and deactivates their registry record.
*   **Slashing vs. Poor Performance:** 
    *   *Protocol Infraction (Dispute Game):* If the agent commits a protocol infraction (e.g., fails to submit telemetry log references or attempts malicious trades), any user can challenge their audit trail on-chain.
*   **Optimistic Slashing Dispute Resolution:** Rather than relying on a centralized admin, challenges are handled optimistically:
    1. A disputer submits a challenge by locking a dispute bond (0.01 SUI on Testnet, 0.5% TVL on Mainnet) and calling `submit_dispute()`.
    2. The operator is granted a 24-hour window to disclose the decryption key for the suspect telemetry log by calling `disclose_telemetry_key()`.
    3. If the operator discloses the key, they prove compliance: the dispute is marked resolved, and the disputer is refunded.
    4. If the operator fails to disclose the key within 24 hours, anyone can call `resolve_dispute()`, which slashes the operator's collateral stake, awards it to the disputer as a bounty (the 10x multiplier reward), and deactivates the agent.
*   **Front-Run-Slash Prevention:** Timed suspensions via `blacklist_agent()` remain as an admin/DAO option during active investigations. However, the 24-hour dispute window programmatically closes the front-run-slash escape path. An operator cannot call `deregister_agent` to reclaim their stake once an active dispute has been registered against them; their stake remains locked in the registry until the dispute is resolved.
*   **The "Liquidate" UI Option:** The "Liquidate" button in the frontend settings modal revokes the policy wallet (`revoke_policy`) and returns the remaining quote capital (dUSDC) to the owner's main wallet. It is separate from the agent's SUI stake bond and the dispute game, which reside in the shared Registry.

## F. DeepBook Predict Strategy & Chart Data Accuracy
*   **DeepBook Ingestion and Replay Loop:** AURA agents do not trade randomly. The ingest pipeline ([fetch_deepbook_traces.ts](file:///Users/vadim/Desktop/AURA/sdk/fetch_deepbook_traces.ts)) queries the Sui blockchain for actual historical DeepBook Predict user `MintRange` transactions (strikes, expiries, amounts) and saves them in [deepbook_traces.json](file:///Users/vadim/Desktop/AURA/sdk/deepbook_traces.json). The off-chain bot runner ([bot_runner.ts](file:///Users/vadim/Desktop/AURA/sdk/bot_runner.ts)) reads these authentic human trades, dynamically scaling whale traces (>1B) down to 20 dUSDC and retail traces to 5 dUSDC, acting as an automated copy-trading simulator under on-chain policy bounds. This feature is **100% complete and fully operational on Sui Testnet**.
*   **Risk Style Slider Mapping:** When strategy preset mode is selected, the risk tolerance setting (Conservative / Balanced / Aggressive) dynamically adjust the trading spread parameters (margin from base price) and budget limits relative to the volatility estimates retrieved from the DeepBook SVI oracle ([predict_agent.ts](file:///Users/vadim/Desktop/AURA/sdk/predict_agent.ts#L229-L234)). Copy-trade target execution automatically mirrors the parameters of the chosen top-performing agent.
*   **Dashboard Chart Data Accuracy:** The main dashboard chart displays illustrative/projected PnL curves. Because client-side browsers cannot easily index and compute historical PnL from raw blockchain transactions in real-time, the chart derives simulated PnL paths mathematically from the agent's current on-chain reputation score (representing projected capital growth or decay if their current win/loss ratio is maintained). A disclaimer is displayed on the dashboard to notify auditors.

## G. Graceful Handling of Gas or Funds Depletion

AURA manages resource depletion at both the on-chain execution layer and the browser simulation layer to prevent transaction crashes or silent failures:

1.  **On-Chain Agent Keeper Bot Runner (`bot_runner.ts` / `predict_agent.ts`):**
    *   *SUI Gas Auto-Top-Up:* During bootstrap, the owner account queries the agent's gas balance. If it is lower than the gas safety floor (e.g. 0.1 SUI), the owner account automatically sends a top-up transaction.
    *   *Pre-Flight Dry-Run:* Before submitting execution blocks to the RPC provider, the agent builds the atomic Programmable Transaction Block (PTB) and runs `dryRunTransactionBlock` locally. If gas or budget limits are breached, the dry-run fails, avoiding any transaction fee/gas wastage.
    *   *REST API Daemon Control Server:* On Railway/production, the keeper boots a secure Express REST API server (`bot_runner.ts`) instead of running loop trades continuously from start. This pauses all SUI gas-spending loops by default, letting developers start/stop the autonomous trading workers and trigger policy sweeps securely from the frontend *Developer Console* using authenticated headers.
    *   *Graceful Execution Catching:* If a transaction fails mid-loop due to a budget limit or SUI gas exhaustion, the off-chain keeper catches the exception, prints a detailed warning (e.g. `❌ Failed to dry-run or execute transaction block on-chain`), logs a `GAS_EXHAUSTED` state block to Walrus, and halts the loops safely without process crashes.
2.  **Frontend Browser Simulation Layer (`AgentDashboard.tsx`):**
    *   *Virtual Budgeting:* Each registered agent tracks an active `budget` field in their React state, initialized by their deposit amount.
    *   *Real-time Budget Decay/Growth:* Simulated trade cycle outcomes modify this budget (success increases it by `+$0.50` dUSDC, failure decreases it by `-$0.50` dUSDC). The current budget is rendered dynamically in the dashboard directory table (under the *PnL* column).
    *   *Automatic Out-of-Funds Halting:* If an active simulation loop drains an agent's budget to `0.00 dUSDC`, the scheduler immediately halts the loop, removes it from active scheduler loops, logs a warning `❌ Simulation halted: Agent has exhausted its policy wallet dUSDC budget! Please deposit funds to resume.`, and blocks manual "Step" triggers.

## H. The "Non-Deterministic Polling Trap" (Circuit Breakers)
*   **The Issue:** A failing smart contract execution or a bug in the off-chain keeper bot runner creates an infinite polling loop that repeatedly issues transaction dry-runs. This exhausts node resources and leaks computational state, showing up as endless log warnings.
*   **The Resolution:** We introduce a deterministic **Circuit Breaker** pattern in [bot_runner.ts](file:///Users/vadim/Desktop/AURA/sdk/bot_runner.ts):
    1. The runner tracks consecutive failures of `dryRunTransactionBlock` or transaction submission.
    2. It implements exponential backoff intervals between attempts (e.g. 2s, 4s, 8s).
    3. If the runner encounters **three consecutive failures**, it trips the circuit breaker: programmatically halting all loop execution, halting trades, and emitting a critical `CIRCUIT_BREAKER_TRIPPED` status message archived in its Walrus memory. This stops all infinite polling traps and alerts operators via telemetry.

## I. Reasoning Degradation & Human-in-the-Loop Escalation
*   **The Issue:** An autonomous trading agent generates trades based on low-confidence reasoning paths (e.g. when LLM inputs are highly volatile, or when the model starts hallucinating strike pricing), leading to capital loss despite operating within budget rules.
*   **The Resolution:** We establish a **Human-in-the-Loop (HITL) Escalation Path** in [bot_runner.ts](file:///Users/vadim/Desktop/AURA/sdk/bot_runner.ts):
    1. Before formatting any PTB, the agent calculates an internal `confidence_score` (between 0.0 and 1.0) derived from SVI modeling and historical win rates.
    2. If this confidence score drops below a configurable threshold (e.g., `0.60`), the agent halts the autonomous loop execution.
    3. The loop emits a suspended state notification `Escalated to Human Owner: Low Confidence Score (score: X)` to the dashboard, letting the owner manually review and resume execution, rather than executing high-risk, low-confidence orders.
*   **Initial Registration Exemption:** This confidence-based HITL check operates exclusively during active trading cycles. It does not affect the initial agent registration on-chain (`register_agent`), which initializes the agent record with a default Bayesian prior reputation of 50%. The registration completes successfully regardless of the agent's current or subsequent confidence states.

## J. Volatility Risk Scaling & Context Overflows
*   **Reflective Memory Risk Calibration:** To survive adverse market conditions, the agent monitors its Walrus history. Upon detecting a prior-cycle loss, it dynamically applies risk-aversion parameters:
    *   *Trade Size Reduction (-25%):* Scales down the Value at Risk (VaR) to protect owner capital.
    *   *Spread Widening (+20%):* Widens option strike ranges relative to SVI volatility estimates. This demands a higher volatility risk premium and reduces exposure to toxic flow.
    *   These parameters (25% size reduction, 20% margin expansion) are mathematically calibrated to provide a robust risk-off response without rendering the agent non-competitive or disabling its recovery potential.
*   **Context Window Bloating (State Compression):** Continuous telemetry logging quickly overflows the LLM context window. To resolve this, AURA implements periodic state compression: after every 5 cycles, the agent aggregates raw logs into a single dense "Strategy Summary String" (containing metrics like win-rate and net PnL) uploaded to Walrus, committing the summary blob ID to the on-chain registry. Subsequent cycles read this summary context directly, optimizing context utilization.

## K. LLM Infrastructure Availability & OpenRouter Fallbacks
*   **The Issue:** The agent relies on an external router API (OpenRouter) to fetch options parameters. If OpenRouter is offline, throttled, or under heavy latency spikes, the agent could freeze.
*   **The Resolution:** 
    1.  **Deterministic Volatility Fallback:** In [predict_agent.ts](file:///Users/vadim/Desktop/AURA/sdk/predict_agent.ts#L386-L396), the agent implements a robust catch-and-fallback logic. If the OpenRouter query fails, the agent immediately computes strikes locally using the deterministic SVI volatility spread model.
    2.  **Robust Error Handling:** The exception is logged cleanly as a warning, and the cycle continues uninterrupted using the local fallback values.
    3.  **Circuit Breaker Coupling:** If the local fallback runs but the underlying contract calls revert three consecutive times, the core bot runner's circuit breaker will trip, pausing the worker process to protect capital.

