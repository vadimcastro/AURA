# Sui CLI Command Guide & Troubleshooting

This guide documents the verified, correct Sui CLI commands used for publishing, interacting with, and maintaining the AURA protocol on Sui Testnet.

---

## 🌐 1. Environment & Wallet Commands

Before executing transactions, verify your active network, wallet address, and gas balances.

### Check Active Environment
Ensure you are targeting the Testnet network:
```bash
sui client active-env
```
If you need to switch to Testnet:
```bash
sui client switch --env testnet
```

### Check Wallet & Balances
```bash
sui client active-address   # Show active signing address
sui client balance          # Show SUI and custom coin (e.g. dUSDC) balances
sui client gas              # List all individual SUI gas coins owned
```

---

## 🏗️ 2. Package Compilation & Publishing

### Compile Move Modules
Run compilation from the contract directory (`contracts_sui/`):
```bash
sui move build
```

### Force a Fresh Package Publish
If a package has already been published in the environment, the compiler stores metadata in `Published.toml` and `Move.lock`, preventing a fresh republish. To force a clean publish at a new address:
1. Clear or empty `Published.toml` (e.g., replace contents with `# empty`).
2. Run the publish command with a sufficient gas budget (typically 200,000,000 MIST / 0.2 SUI is safe for packages with multiple modules):
```bash
sui client publish --gas-budget 200000000 --json
```

---

## 📄 3. On-Chain Interactivity (Registry & Policy)

Below are the exact commands to interact with the AURA registry and policy wallets using `sui client call`.

### Register a Trading Agent
Stakes a SUI bond (`stake_coin`) to register the active address as a validated agent on the shared registry:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function register_agent \
  --args <REGISTRY_OBJECT_ID> <STAKE_COIN_OBJECT_ID> \
  --gas-budget 20000000 \
  --json
```

### Create a Wallet Policy
Deploys a shared `WalletPolicy` object authorizing an agent to trade custom tokens with specific target packages:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module agent_wallet_policy \
  --function create_policy \
  --type-args <TOKEN_TYPE_TAG> \
  --args \
    <AGENT_ADDRESS> \
    <BUDGET_CEILING> \
    "[<ALLOWED_TARGET_PACKAGE_ID>]" \
    <EXPIRATION_EPOCH> \
    <MIN_BALANCE_FLOOR> \
  --gas-budget 20000000 \
  --json
```
*Example Token Type Tag:* `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`

### Deposit Tokens into a Policy
Funds the policy wallet by depositing a compatible coin object:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module agent_wallet_policy \
  --function deposit \
  --type-args <TOKEN_TYPE_TAG> \
  --args <POLICY_OBJECT_ID> <TOKEN_COIN_OBJECT_ID> \
  --gas-budget 20000000 \
  --json
```

### Revoke Policy (Reclaim Balance)
Owner-only action to permanently destroy the policy and disburse all stored token balances back to the owner:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module agent_wallet_policy \
  --function revoke_policy \
  --type-args <TOKEN_TYPE_TAG> \
  --args <POLICY_OBJECT_ID> \
  --gas-budget 10000000 \
  --json
```
*(Note: A gas budget of 10,000,000 MIST / 0.01 SUI is sufficient for cleanup).*

### Slash an Agent (Admin Only)
Slashes the staked bond of a non-compliant or malicious agent, turning their active status to `false`:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function slash_bond \
  --args <REGISTRY_OBJECT_ID> <AGENT_ADDRESS> \
  --gas-budget 10000000 \
  --json
```

---

## 🛠️ 4. Troubleshooting & Verification Lessons

### 1. The Chaining / Index Out of Bounds Constraint
*   **Symptom:** Executing `create_policy` and `deposit` in the same Programmable Transaction Block (PTB) returns `SecondaryIndexOutOfBounds`.
*   **Cause:** `create_policy` initializes the policy object but returns `void`. Passing the policy object to `deposit` in the same execution frame causes the VM to fail to index the shared output since it wasn't returned as a direct argument.
*   **Fix:** Execute policy creation and deposit as two separate transaction blocks.

### 2. Gas Budget Dry-Run Failures
*   **Symptom:** Transaction dry-run fails with `Balance of gas object is lower than the needed amount: X`.
*   **Cause:** Setting an explicitly high gas budget (e.g. `50_000_000` MIST / 0.05 SUI) in SDK scripts triggers pre-flight failures if the signer's gas coin has less than the budget, even if the actual transaction fee is only ~3,000,000 MIST.
*   **Fix:** Calibrate gas budgets dynamically or use lower budgets (e.g., `4_000_000` MIST) for simple executions.

### 3. Invalid BCS Bytes for pure `vector<u8>` Arguments
*   **Symptom:** Calling a Move function that expects `vector<u8>` with `tx.pure(bytes)` fails with `CommandArgumentError { arg_idx: X, kind: InvalidBCSBytes }`.
*   **Cause:** Passing a raw `Uint8Array` directly to `tx.pure()` gets interpreted as pre-serialized BCS bytes. Without an explicit vector length prefix, the Move VM fails to parse it.
*   **Fix:** Use the `bcs` library to serialize the array explicitly:
    ```typescript
    import { bcs } from "@mysten/sui/bcs";
    tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(blobIdBytes)).toBytes());
    ```

### 4. SDK Move Abort Catching
*   **Symptom:** Calling `tx.build()` on an adversarial transaction throws an unhandled exception rather than producing transaction bytes for `dryRunTransactionBlock`.
*   **Cause:** The new `@mysten/sui` v1.x SDK executes type-resolution and budget checks via internal dry-runs during the `tx.build()` phase. If the code aborts (e.g., budget exceeded or expired), the SDK throws an error immediately.
*   **Fix:** Wrap the build and dry-run steps inside a `try-catch` block and parse the caught error message for `MoveAbort(..., expectedAbortCode)` to verify safety boundaries.
