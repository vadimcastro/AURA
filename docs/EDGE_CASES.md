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
