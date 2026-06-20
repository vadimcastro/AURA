import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as crypto from "crypto";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID,
  DEEPBOOK_PREDICT_PACKAGE_ID,
  DUSDC_TYPE_TAG,
  getAgentKeypair 
} from "./config.js";
import { executeTradeCycle } from "./predict_agent.js";
import { decryptWithSeal } from "./walrus_archiver.js";

const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to derive deterministic keypair
function deriveAgentKeypair(ownerKeypair: Ed25519Keypair, name: string): Ed25519Keypair {
  const ownerSecret = (ownerKeypair as any).keypair.secretKey;
  const seed = crypto.createHash("sha256").update(ownerSecret).update(name).digest();
  return Ed25519Keypair.fromSecretKey(seed);
}

// Find active policy on-chain
async function findExistingPolicy(ownerAddress: string, agentAddress: string): Promise<string | null> {
  console.log(`🔍 Checking policy for agent ${agentAddress}...`);
  let hasNextPage = true;
  let cursor: any = null;

  while (hasNextPage) {
    try {
      const events = await SUI_CLIENT.queryEvents({
        query: { MoveEventType: `${AURA_PACKAGE_ID}::agent_wallet_policy::PolicyCreated` },
        cursor,
        limit: 50
      });

      for (const ev of events.data) {
        const evJson = ev.parsedJson as any;
        if (evJson?.owner === ownerAddress && evJson?.agent === agentAddress) {
          const policyId = evJson?.policy_id;
          if (policyId) {
            const obj = await SUI_CLIENT.getObject({ id: policyId });
            if (obj.data && !obj.error) {
              return policyId;
            }
          }
        }
      }
      hasNextPage = events.hasNextPage;
      cursor = events.nextCursor ?? null;
    } catch (err) {
      break;
    }
  }
  return null;
}

// Check agent registration
async function checkIsRegistered(registryId: string, agentAddress: string): Promise<boolean> {
  try {
    const regObj = await SUI_CLIENT.getObject({ id: registryId, options: { showContent: true } });
    const content = regObj.data?.content as any;
    const tableId = content?.fields?.agents?.fields?.id?.id;
    if (!tableId) return false;

    const df = await SUI_CLIENT.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "address", value: agentAddress }
    });
    if (df.data && !df.error) return true;
  } catch (err) {
    // ignore
  }
  return false;
}

// Bootstrap agent (SUI gas + budget + registration)
async function bootstrapAgent(
  ownerKeypair: Ed25519Keypair,
  agentKeypair: Ed25519Keypair,
  agentName: string
) {
  const ownerAddress = ownerKeypair.toSuiAddress();
  const agentAddress = agentKeypair.toSuiAddress();
  console.log(cyan(`🤖 Bootstrapping Copy-Trader Agent [${agentName}] (${agentAddress})`));

  // 1. Gas check & top up
  let balance = 0n;
  try {
    const balObj = await SUI_CLIENT.getBalance({ owner: agentAddress });
    balance = BigInt(balObj.totalBalance);
  } catch (e) {}

  const requiredGas = 100_000_000; // 0.1 SUI
  if (balance < BigInt(requiredGas)) {
    console.log(yellow(`   Low gas. Transferring 0.1 SUI from owner account...`));
    const tx = new Transaction();
    const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(requiredGas)]);
    tx.transferObjects([gasCoin], tx.pure.address(agentAddress));
    const res = await SUI_CLIENT.signAndExecuteTransaction({ signer: ownerKeypair, transaction: tx });
    await SUI_CLIENT.waitForTransaction({ digest: res.digest });
    console.log(green(`   Gas funded. Digest: ${res.digest}`));
  }

  // 2. Policy check
  let policyId = await findExistingPolicy(ownerAddress, agentAddress);
  if (!policyId) {
    console.log(yellow(`   No active policy found. Deploying new WalletPolicy...`));
    const tx1 = new Transaction();
    tx1.moveCall({
      target: `${AURA_PACKAGE_ID}::agent_wallet_policy::create_policy`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [
        tx1.pure.address(agentAddress),
        tx1.pure.u64(25_000_000), // 25 dUSDC budget
        tx1.pure.vector("address", [DEEPBOOK_PREDICT_PACKAGE_ID]),
        tx1.pure.u64(10000000),
        tx1.pure.u64(0),
      ]
    });
    const tx1Res = await SUI_CLIENT.signAndExecuteTransaction({ signer: ownerKeypair, transaction: tx1 });
    await SUI_CLIENT.waitForTransaction({ digest: tx1Res.digest });

    // Retrieve policy ID
    let policyObj;
    for (let i = 0; i < 5; i++) {
      try {
        const effects = await SUI_CLIENT.getTransactionBlock({
          digest: tx1Res.digest,
          options: { showObjectChanges: true }
        });
        policyObj = effects.objectChanges?.find((c) => c.type === "created" && c.objectType.includes("WalletPolicy"));
        if (policyObj) break;
      } catch (e) {}
      await sleep(2000);
    }
    if (!policyObj || !("objectId" in policyObj)) {
      throw new Error("Failed to find new WalletPolicy object ID.");
    }
    policyId = policyObj.objectId;
    console.log(green(`   Created policy object ID: ${policyId}`));

    // Deposit 25 dUSDC
    console.log(yellow(`   Depositing 25 dUSDC budget...`));
    const tx2 = new Transaction();
    const ownerCoins = await SUI_CLIENT.getCoins({ owner: ownerAddress, coinType: DUSDC_TYPE_TAG });
    const usableCoins = ownerCoins.data.filter(c => parseInt(c.balance, 10) > 0);
    if (usableCoins.length === 0) {
      throw new Error("Owner has no dUSDC balance to bootstrap copy-trader.");
    }
    const [split] = tx2.splitCoins(tx2.object(usableCoins[0].coinObjectId), [tx2.pure.u64(25_000_000)]);
    tx2.moveCall({
      target: `${AURA_PACKAGE_ID}::agent_wallet_policy::deposit`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [tx2.object(policyId), split]
    });
    const tx2Res = await SUI_CLIENT.signAndExecuteTransaction({ signer: ownerKeypair, transaction: tx2 });
    await SUI_CLIENT.waitForTransaction({ digest: tx2Res.digest });
    console.log(green(`   dUSDC deposited. Digest: ${tx2Res.digest}`));
  }

  // 3. Register
  const registered = await checkIsRegistered(REGISTRY_OBJECT_ID, agentAddress);
  if (!registered) {
    console.log(yellow(`   Registering copy trader in registry...`));
    const tx3 = new Transaction();
    const [stakeCoin] = tx3.splitCoins(tx3.gas, [tx3.pure.u64(10_000_000)]); // 0.01 SUI stake
    tx3.moveCall({
      target: `${AURA_PACKAGE_ID}::aura_registry::register_agent`,
      arguments: [tx3.object(REGISTRY_OBJECT_ID), stakeCoin]
    });
    const tx3Res = await SUI_CLIENT.signAndExecuteTransaction({ signer: agentKeypair, transaction: tx3 });
    await SUI_CLIENT.waitForTransaction({ digest: tx3Res.digest });
    console.log(green(`   Registered copy-trader in registry. Digest: ${tx3Res.digest}`));
  }

  return { agentKeypair, policyId };
}

// Retrieve target's latest blob ID from the dynamic field inside the registry table
async function getTargetAgentLatestBlobId(targetAddress: string): Promise<string | null> {
  try {
    const regObj = await SUI_CLIENT.getObject({ id: REGISTRY_OBJECT_ID, options: { showContent: true } });
    const content = regObj.data?.content as any;
    const tableId = content?.fields?.agents?.fields?.id?.id;
    if (!tableId) return null;

    const df = await SUI_CLIENT.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "address", value: targetAddress }
    });

    const dfContent = df.data?.content as any;
    const valueFields = dfContent?.fields?.value?.fields;
    const blobRaw = valueFields?.walrus_history_blob;
    if (!blobRaw) return null;

    let latestBlobId: string | null = null;
    if (Array.isArray(blobRaw)) {
      latestBlobId = String.fromCharCode(...(blobRaw as number[]));
    } else if (typeof blobRaw === 'string') {
      latestBlobId = blobRaw;
    } else if (blobRaw.fields?.vec && Array.isArray(blobRaw.fields.vec) && blobRaw.fields.vec.length > 0) {
      const byteVec = blobRaw.fields.vec[0];
      latestBlobId = typeof byteVec === 'string' ? byteVec : String.fromCharCode(...(byteVec as number[]));
    }
    return latestBlobId;
  } catch (err) {
    console.error(red("⚠️ Failed to retrieve target agent's latest blob ID:"), (err as Error).message);
    return null;
  }
}

// Fetch encrypted trace from Walrus aggregator and decrypt using Seal
async function fetchAndDecryptTrace(blobId: string): Promise<any> {
  const url = `https://aggregator.walrus-testnet.walrus.space/v1/blobs/${blobId}`;
  console.log(`📥 Downloading target trace from Walrus aggregator: ${blobId}...`);
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Walrus download failed: ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const encryptedPayload = new Uint8Array(arrayBuffer);
  
  console.log(`🔑 Decrypting strategy trace client-side using Seal threshold parameters...`);
  const decryptedBytes = await decryptWithSeal(encryptedPayload);
  const jsonStr = new TextDecoder().decode(decryptedBytes);
  return JSON.parse(jsonStr);
}

function parseStrikes(decision: string): { lowerStrike: number; higherStrike: number } {
  const match = decision.match(/Mint Range (\d+\.?\d*)k-(\d+\.?\d*)k/);
  if (match) {
    const lowerStrike = Math.round(parseFloat(match[1]) * 1000);
    const higherStrike = Math.round(parseFloat(match[2]) * 1000);
    return { lowerStrike, higherStrike };
  }
  return { lowerStrike: 65000, higherStrike: 75000 };
}

async function run() {
  const targetAddress = process.argv[2];
  if (!targetAddress) {
    console.log(red("\n❌ Error: Missing target agent address."));
    console.log("Usage: node dist/run_copy_trader.js <TARGET_AGENT_ADDRESS>\n");
    process.exit(1);
  }

  console.log(magenta("========================================================="));
  console.log(magenta("🛡️  AURA Live Copy Trading Engine (Testnet)                "));
  console.log(magenta("=========================================================\n"));

  console.log(`Target Agent: ${targetAddress}`);

  // Resolve target's latest blob ID
  const blobId = await getTargetAgentLatestBlobId(targetAddress);
  if (!blobId) {
    console.log(red(`❌ Error: No audit logs found for target agent ${targetAddress}.`));
    process.exit(1);
  }
  console.log(green(`Found latest target blob ID: ${blobId}`));

  // Fetch and decrypt trace
  let trace;
  try {
    trace = await fetchAndDecryptTrace(blobId);
    console.log(green("✅ Telemetry trace decrypted successfully. Contents:"));
    console.log(cyan(JSON.stringify(trace, null, 2)));
  } catch (e) {
    console.log(red(`❌ Decryption or download failed: ${(e as Error).message}`));
    process.exit(1);
  }

  // Parse trade parameters
  const { lowerStrike, higherStrike } = parseStrikes(trace.trade_decision);
  const amount = trace.trade_amount_dusdc;
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24h expiry

  console.log(magenta("\n========================================================="));
  console.log(magenta("🚀 Copying Trade Configuration:"));
  console.log(`  Lower Strike:  ${lowerStrike}`);
  console.log(`  Higher Strike: ${higherStrike}`);
  console.log(`  Expiry Offset: 24 Hours`);
  console.log(`  Capital Size:  ${amount / 1e6} dUSDC`);
  console.log(magenta("=========================================================\n"));

  // Bootstrap copy-trader agent
  const ownerKeypair = getAgentKeypair();
  const agentKey = deriveAgentKeypair(ownerKeypair, `copy-trader-for-${targetAddress.substring(0, 10)}`);
  
  const copyTrader = await bootstrapAgent(ownerKeypair, agentKey, `CopyTrader Target:${targetAddress.substring(2, 8)}`);

  console.log(green(`\n📡 Submitting cloned transaction to Sui Testnet under copy-trader's WalletPolicy...`));
  const res = await executeTradeCycle(copyTrader.agentKeypair, copyTrader.policyId, {
    mockMode: false,
    walrusMockFallback: false,
    copyParams: {
      lowerStrike,
      higherStrike,
      expiry,
      amount
    }
  });

  if (res.success) {
    console.log(green(`\n✅ Copy trade executed successfully! Sui Tx: ${res.txDigest}`));
    console.log(cyan(`📦 Telemetry audit trail archived on Walrus. Blob ID: ${res.blobId}`));
  } else {
    console.log(red("\n❌ Copy trade execution failed."));
  }
}

run().catch(err => {
  console.error(red("\n💥 Fatal error in live copy trader:"), err);
  process.exit(1);
});
