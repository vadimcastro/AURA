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
sui client balance          # Show SUI, WAL, and custom coin (e.g., dUSDC) balances
sui client gas              # List individual SUI gas coin objects
```

### Walrus Token Conversion (SUI to WAL)
Walrus decentralized storage requires WAL tokens to buy storage allocations. Convert SUI testnet tokens to WAL using the Walrus CLI:
1. **Install Walrus CLI (Testnet):**
   ```bash
   curl -sSf https://install.wal.app | sh -s -- -n testnet
   ```
   *Note: Ensure `/Users/vadim/.local/bin/` is added to your terminal environment `PATH`.*
2. **Convert SUI to WAL:**
   ```bash
   walrus get-wal --context testnet
   ```
   *Note: This command will convert 1.0 SUI into 1.0 WAL by default. 1.0 WAL is sufficient to rent storage for thousands of encrypted telemetry audit logs (since JSON traces are only ~2-5 KB each).*
3. **Confirm balance update:**
   ```bash
   sui client balance
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

### Submit Telemetry Dispute
Submits an optimistic dispute challenging an agent operator's telemetry trace. Requires locking a dispute bond (0.01 SUI testnet / 50.0 SUI mainnet):
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function submit_dispute \
  --args <REGISTRY_OBJECT_ID> <CLOCK_OBJECT_ID> <AGENT_ADDRESS> <BLOB_ID_BYTES> <BOND_COIN_OBJECT_ID> \
  --gas-budget 20000000 \
  --json
```
*Note: Clock object ID is `0x6` on-chain.*

### Disclose Telemetry Key (Operator Resolution)
Called by the agent operator to disclose the decryption key for the challenged trace within 24 hours, resolving the dispute and reclaiming their bond:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function disclose_telemetry_key \
  --args <REGISTRY_OBJECT_ID> <DISPUTE_ID> <DECRYPTION_KEY_BYTES> \
  --gas-budget 20000000 \
  --json
```

### Resolve Dispute (Timeout Slashing)
Can be called by anyone after the 24-hour deadline has passed. If the operator failed to disclose the key, this slashes the operator's stake and awards it to the disputer:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function resolve_dispute \
  --args <REGISTRY_OBJECT_ID> <CLOCK_OBJECT_ID> <DISPUTE_ID> \
  --gas-budget 20000000 \
  --json
```

### Mint Strategy NFT
Operator only: mints an `AgentNFT` representing their proven active registry reputation score snapshot:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module agent_nft \
  --function mint_and_keep \
  --args <REGISTRY_OBJECT_ID> <NAME_BYTES> <DESCRIPTION_BYTES> <STRATEGY_TYPE_BYTES> <IMAGE_URL_BYTES> \
  --gas-budget 20000000 \
  --json
```

### Create Kiosk and Place NFT
Operator only: mints the `AgentNFT` and places it inside a new shared `sui::kiosk::Kiosk` object on-chain, routing the Owner Capability to the operator:
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module agent_nft \
  --function create_kiosk_and_place \
  --args <REGISTRY_OBJECT_ID> <NAME_BYTES> <DESCRIPTION_BYTES> <STRATEGY_TYPE_BYTES> <IMAGE_URL_BYTES> \
  --gas-budget 20000000 \
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

### 5. SDK v2.x Client Migration & Deprecations
* **Constraint:** Upgrading to `@mysten/sui` v2.x removes `SuiClient` and `getFullnodeUrl` from the `@mysten/sui/client` entrypoint.
* **Explanation:** Mysten Labs deprecated the JSON-RPC interface in favor of gRPC. The JSON-RPC classes were relocated to `@mysten/sui/jsonRpc`.
* **Fix:** Import client and URL helpers from the correct jsonRpc bundle:
  ```typescript
  import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
  ```

### 6. `@mysten/dapp-kit` v1.x Transport Configuration
* **Constraint:** Mismatches between dApp-kit v1.x and `@mysten/sui` v2.x cause type errors: `Property 'transport' is missing in type '{ url: ... }'`.
* **Explanation:** Modern dApp-kit requires setting up an explicit network transport instance rather than passing a raw URL string.
* **Fix:** Configure `createNetworkConfig` using the `JsonRpcHTTPTransport` constructor and include the required `network` key:
  ```typescript
  import { createNetworkConfig } from "@mysten/dapp-kit";
  import { JsonRpcHTTPTransport, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";

  const { networkConfig } = createNetworkConfig({
    testnet: {
      network: "testnet",
      transport: new JsonRpcHTTPTransport({
        url: getJsonRpcFullnodeUrl("testnet"),
      }),
    },
  });
  ```

---

## 📦 5. Core Package Installations

### Frontend Dashboard Packages
Ensure clean compilation of the client dashboard with appropriate Sui dApp-kit and react-query dependencies:
```bash
# From dashboard/ directory:
npm install @mysten/dapp-kit@^1.1.1 @mysten/sui@^2.19.0 @tanstack/react-query@^5.101.0
```

### SDK Packages
Ensure correct Sui libraries are configured in the SDK:
```bash
# From sdk/ directory:
npm install @mysten/sui@^1.1.0 dotenv@^16.4.5
```

---

## ⚙️ 6. Environment & Deployment Setup

### Vercel / Client Dashboard Production Env (4 Variables)
Set the following 4 environment variables in the Vercel dashboard or locally inside `dashboard/.env.local` to run the frontend app:
```env
VITE_AURA_PACKAGE_ID=0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e
VITE_REGISTRY_OBJECT_ID=0x848bfe3b550bae763d6b408f9613f416bfbf4ded0c20f531a63906250c666e8c
VITE_SUI_RPC_URL=https://fullnode.testnet.sui.io:443
VITE_WALRUS_AGGREGATOR=https://aggregator.walrus-testnet.walrus.space
```

### Local SDK / Off-chain Daemon Env
Configure inside `sdk/.env` for off-chain automation and tests:
```env
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
AURA_PACKAGE_ID=0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e
REGISTRY_OBJECT_ID=0x848bfe3b550bae763d6b408f9613f416bfbf4ded0c20f531a63906250c666e8c
AGENT_PRIVATE_KEY=suiprivkey1qq...                 # Active operator key
DEEPBOOK_PREDICT_PACKAGE_ID=0xb03d26d64408c965e293...
DEEPBOOK_POOL_ID=0xb1c2c42afc347fe432d27f238c...
DUSDC_TYPE_TAG=0xe95040085976bfd54a1a072...
```

---

## 🛡️ 8. Policy Funds Recovery & Sweeper Tool

AURA supports a multi-deployment funds recovery script to reclaim all dUSDC locked inside historical or active policy wallets.

### Reclaim Script Execution
Run the following script to sweep and refund locked dUSDC and retrieve SUI gas storage rebates:
```bash
# Navigate to the SDK folder
cd sdk

# Compile and execute the recovery sweep
npm run recover
```

This script:
1. Checks and logs initial SUI gas and dUSDC balances of the active agent keypair.
2. Automatically queries historical contract deployments (`0x7cb6...`, `0x7409...`) and the current deployment (`0xb03d...`) for all `PolicyCreated` events owned by the keypair.
3. Submits `revoke_policy` transactions to dismantle empty/abandoned policy wallets, reclaiming SUI gas rebates and returning dUSDC balances to the keypair address.
4. Outputs final SUI gas and dUSDC balances, showing the net funds successfully recovered.

*Optional:* Reclaim from a specific package ID by providing it as a CLI parameter:
```bash
npm run recover 0x7cb617c78407fdae14a8e51f12da5cd7c7abf2dc67f6c0c58c5fdb8ce40dd922
```

---

## 🌐 9. Cloud Operator Control REST API

When deployed to Railway (accessible at `https://auraregistry.up.railway.app`), the bot runner SDK boots a secure, lightweight Express API server listening on `PORT` (default `3000`) instead of running active transactions unconditionally. This prevents gas faucet drainage until activated.

All state-modifying endpoints require an `x-api-key` header matching the `ADMIN_API_KEY` configured in the backend environment.

### API Endpoint Index

#### 1. Check Status
*   **Endpoint:** `GET /api/status`
*   **Auth Required:** None
*   **Returns:** Execution status, operator address, SUI/dUSDC balances.

#### 2. Start Execution Loop
*   **Endpoint:** `POST /api/start`
*   **Auth Required:** Yes (`x-api-key: <ADMIN_API_KEY>`)
*   **Payload:** `{ "intervalMs": 30000 }` (default 30s)
*   **Returns:** Success message confirming background loop initialization.

#### 3. Stop Execution Loop
*   **Endpoint:** `POST /api/stop`
*   **Auth Required:** Yes (`x-api-key: <ADMIN_API_KEY>`)
*   **Returns:** Confirmation that all continuous trading tasks have been stopped.

#### 4. Reclaim Locked Policy Funds
*   **Endpoint:** `POST /api/recover`
*   **Auth Required:** Yes (`x-api-key: <ADMIN_API_KEY>`)
*   **Returns:** Sweeps all policy wallets on-chain and returns final reclaimed count.

