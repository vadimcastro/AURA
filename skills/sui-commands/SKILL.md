---
name: sui-commands
description: >-
  Guides the compilation, deployment, testing, and interaction with Move smart
  contracts on the Sui blockchain, specifically covering the AURA AgentFi
  protocol, PTB construction, and client-side troubleshooting.
---

# Sui CLI & Move Smart Contract Skill

This skill provides the correct, verified commands and programmatic patterns to compile, test, deploy, and interact with Move packages on the Sui network, with a focus on AgentFi protocols like AURA.

---

## 🌐 1. Environment & Wallet Preparation

Before performing any deployment or contract execution:

### Active Network Configuration
Ensure you are targeting the correct network (normally `testnet` or `devnet` for development, `mainnet` for production):
```bash
sui client active-env
```
To switch environment:
```bash
sui client switch --env testnet
```

### Wallet Balance Check
Check active signing keys, balances, and gas coins:
```bash
sui client active-address   # Show active signing address
sui client balance          # Show SUI and custom coin (e.g., dUSDC) balances
sui client gas              # List individual SUI gas coin objects
```

---

## 🏗️ 2. Compilation, Testing & Publishing

### Compile Move Contracts
Always run compilation from the directory containing `Move.toml` (e.g., `contracts_sui/`):
```bash
sui move build
```

### Execute Move Unit Tests
Run the contract test suite to verify storage constraints and access control:
```bash
sui move test
```
To run a specific test case:
```bash
sui move test --filter <test_name_pattern>
```

### Deploy / Publish Move Package
If a package was previously published, metadata is saved in `Published.toml` and `Move.lock`. To force a clean republish:
1. Clear or empty `Published.toml` (e.g., replace contents with `# empty`).
2. Delete `Move.lock` if dependencies have updated.
3. Deploy using `sui client publish`:
```bash
sui client publish --gas-budget 200000000 --json
```
> [!TIP]
> A gas budget of 200,000,000 MIST (0.2 SUI) is safe for multi-module deployments. Add `--skip-fetch-latest-git-deps` if local development is offline or slow.

---

## 📄 3. Protocol Operations (Sui CLI Call Examples)

Replace `<AURA_PACKAGE_ID>`, `<REGISTRY_OBJECT_ID>`, and other placeholders with your deployed object hex strings.

### Register Trading Agent (Stakes SUI)
Registers the active signing address on the shared reputation registry with a SUI bond:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function register_agent \
  --args <REGISTRY_OBJECT_ID> <STAKE_COIN_OBJECT_ID> \
  --gas-budget 20000000 \
  --json
```

### Create an Agent Policy Wallet
Creates a shared policy object authorizing an agent to trade assets within budget bounds:
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
*Example Type Tag:* `0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC`

### Fund Policy Wallet (Deposit)
Deposits generic coins into the policy wallet to fund the agent's trades:
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

### Admin Slashes Malicious Agent
Admin only: slashes the staked bond of a non-compliant or malicious agent:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function slash_bond \
  --args <REGISTRY_OBJECT_ID> <AGENT_ADDRESS> \
  --gas-budget 10000000 \
  --json
```

### Revoke Policy (Reclaim Balance)
Owner only: destroys the policy wallet and transfers all remaining balances back to the owner:
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

---

## 🛠️ 4. SDK Integration & Troubleshooting Lessons

### 1. PTB Command Chaining Constraint
* **Constraint:** Do not chain `create_policy` and `deposit` in a single Programmable Transaction Block (PTB).
* **Explanation:** `create_policy` publishes a shared object but returns `void`. Passing the policy object to a subsequent `deposit` command in the same block causes the Sui VM to fail with a `SecondaryIndexOutOfBounds` error.
* **Fix:** Execute policy creation and funding as two separate, sequential transaction blocks.

### 2. Pure Vector Serialization (`vector<u8>`)
* **Constraint:** Do not pass raw `Uint8Array` directly to `tx.pure()` when a Move function expects a `vector<u8>`.
* **Explanation:** Raw array buffers are parsed as raw BCS bytes. Without explicit length headers, the Move VM fails to parse them (`InvalidBCSBytes`).
* **Fix:** Serialize explicitly using the `@mysten/sui/bcs` package:
  ```typescript
  import { bcs } from "@mysten/sui/bcs";
  tx.pure(bcs.vector(bcs.u8()).serialize(Array.from(rawBytes)).toBytes());
  ```

### 3. Gas Budget Dry-Run Boundaries
* **Constraint:** Setting an excessively high gas budget in `Transaction` pre-flights will cause failures if the signer lacks that amount.
* **Explanation:** Sui's RPC checks if the signer has gas coins matching the requested budget limit, not the estimated fee.
* **Fix:** Set a small, precise gas budget (e.g. `2_000_000` MIST / 0.002 SUI) for simple transactions, and verify via `dryRunTransactionBlock` before execution.

### 4. SDK Move Abort Catching in Dry-Runs
* **Constraint:** In the `@mysten/sui` v1.x SDK, `tx.build()` execution internally triggers dry-run validation. If the transaction contains assertions that will fail (e.g., verifying adversarial outcomes), `tx.build()` throws an exception.
* **Fix:** Wrap the build step in a try-catch block and search for `MoveAbort` strings:
  ```typescript
  try {
    const bytes = await tx.build({ client: SUI_CLIENT });
    const dryRun = await SUI_CLIENT.dryRunTransactionBlock({ transactionBlock: bytes });
  } catch (error) {
    const errorMsg = (error as Error).message;
    const match = errorMsg.match(/MoveAbort\(.*?,?\s*(\d+)\)/);
    if (match) {
      const abortCode = parseInt(match[1], 10);
      console.log(`Successfully intercepted MoveAbort code: ${abortCode}`);
    }
  }
  ```
