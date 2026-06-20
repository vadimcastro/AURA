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
*(Note: A gas budget of 10,000,000 MIST / 0.01 SUI is sufficient for cleanup).*

### Submit Telemetry Dispute
Submits an optimistic dispute challenging an agent operator's telemetry trace. Requires locking a dispute bond (0.1 SUI testnet / 1.0 SUI mainnet):
```bash
sui client call \
  --package <AURA_PACKAGE_ID> \
  --module aura_registry \
  --function submit_dispute \
  --args <REGISTRY_OBJECT_ID> <CLOCK_OBJECT_ID> <AGENT_ADDRESS> <BLOB_ID_BYTES> <BOND_COIN_OBJECT_ID> \
  --gas-budget 20000000 \
  --json
```
*Note: Clock object ID is `0x6` on Sui Testnet.*

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

### 5. SDK v2.x Client Migration & Deprecations
*   **Symptom:** Upgrading to `@mysten/sui` v2.x removes `SuiClient` and `getFullnodeUrl` from `@mysten/sui/client`.
*   **Explanation:** Mysten Labs relocated JSON-RPC transport helper functions to `@mysten/sui/jsonRpc`.
*   **Fix:** Import the JSON-RPC compatible client class and configuration helper:
    ```typescript
    import { SuiJsonRpcClient as SuiClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
    ```

### 6. `@mysten/dapp-kit` v1.x Transport Configuration
*   **Symptom:** `Property 'transport' is missing in type '{ url: ... }'` when initializing network providers.
*   **Explanation:** Modern dApp-kit provider configs require setting up an explicit network transport instance.
*   **Fix:** Initialize `createNetworkConfig` using the `JsonRpcHTTPTransport` class and supply the required `network` parameter:
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

### Frontend Dashboard Dependencies
Run this command in the dashboard directory to install the modern dApp connection stack:
```bash
# dashboard/
npm install @mysten/dapp-kit@^1.1.1 @mysten/sui@^2.19.0 @tanstack/react-query@^5.101.0
```

### SDK Dependencies
Run this command in the SDK directory:
```bash
# sdk/
npm install @mysten/sui@^1.1.0 dotenv@^16.4.5
```

---

## ⚙️ 6. Environment & Deployment Configuration

### Vercel / Client Dashboard Production Env (4 Variables)
When deploying the client dashboard to Vercel (or configuring locally inside `dashboard/.env.local`), configure the following 4 environment variables:
*   `VITE_AURA_PACKAGE_ID`: `0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e`
*   `VITE_REGISTRY_OBJECT_ID`: `0x848bfe3b550bae763d6b408f9613f416bfbf4ded0c20f531a63906250c666e8c`
*   `VITE_SUI_RPC_URL`: `https://fullnode.testnet.sui.io:443`
*   `VITE_WALRUS_AGGREGATOR`: `https://aggregator.walrus-testnet.walrus.space`

*Tip: You can import your local `dashboard/.env.local` file directly inside the Vercel project settings dashboard.*

### Local SDK / Off-chain Daemon Env Settings (5+ Variables inside `sdk/.env`)
The off-chain bot runners and live testnet copy trading scripts require full transaction execution configurations:
```env
SUI_RPC_URL=https://fullnode.testnet.sui.io:443
AURA_PACKAGE_ID=0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e
REGISTRY_OBJECT_ID=0x848bfe3b550bae763d6b408f9613f416bfbf4ded0c20f531a63906250c666e8c
AGENT_PRIVATE_KEY=suiprivkey1qq...                 # Active operator secret key seed
DEEPBOOK_PREDICT_PACKAGE_ID=0xb03d26d64408c965e293... # DeepBook Predict contract address
DEEPBOOK_POOL_ID=0xb1c2c42afc347fe432d27f238c...      # Active testnet prediction market pool
DUSDC_TYPE_TAG=0xe95040085976bfd54a1a072...          # Coin type tag for prediction quote asset (dUSDC)
```

---

## 🚀 7. Live Copy Trading on Testnet

AURA supports executing live, real-time copy trading transactions on the Sui Testnet. Rather than mock simulations, the copy trader fetches a target agent's encrypted strategy log from Walrus, decrypts the parameters using the Seal passphrases client-side, derives a unique executor agent wallet policy on-chain, and executes a corresponding DeepBook option trade directly.

### Running Live Copy Trades
Execute the following commands to run the copy trader against a target agent on-chain:
```bash
cd sdk
npx tsx run_copy_trader.ts <TARGET_AGENT_ADDRESS>
```
*Note: Make sure your `sdk/.env` is configured with a valid operator private key that has SUI for gas and dUSDC in its wallet to fund the copy trader's budget.*

---

## 🛡️ 7. Policy Funds Recovery Tool

A TS recovery utility is available inside the SDK folder to sweep expired or abandoned policy wallets. It fetches `PolicyCreated` events matching the active operator key address and executes `revoke_policy` transactions to return funds.

### Running the Sweeper
Compile the SDK and trigger the recovery process:
```bash
cd sdk
npm run recover
```

This utility sweeps:
1. The active deployment package: `0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e`
2. Preceding historical deployments: `0x7cb617c7...` and `0x74093b56...`

To target a specific package ID exclusively, run:
```bash
npm run recover <TARGET_PACKAGE_ID>
```

