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

const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper to derive a deterministic agent keypair from owner key + name salt
function deriveAgentKeypair(ownerKeypair: Ed25519Keypair, name: string): Ed25519Keypair {
  const ownerSecret = (ownerKeypair as any).keypair.secretKey;
  const seed = crypto.createHash("sha256").update(ownerSecret).update(name).digest();
  return Ed25519Keypair.fromSecretKey(seed);
}

// Find existing policy for agent/owner combination by querying on-chain events
async function findExistingPolicy(ownerAddress: string, agentAddress: string): Promise<string | null> {
  console.log(`🔍 Checking for existing on-chain policy for agent ${agentAddress}...`);
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
            // Verify that the policy object still exists on-chain and wasn't deleted
            const obj = await SUI_CLIENT.getObject({ id: policyId });
            if (obj.data && !obj.error) {
              console.log(green(`   Found active policy: ${policyId}`));
              return policyId;
            }
          }
        }
      }
      hasNextPage = events.hasNextPage;
      cursor = events.nextCursor ?? null;
    } catch (err) {
      console.warn(`   ⚠️ Failed to query PolicyCreated events:`, (err as Error).message);
      break;
    }
  }

  return null;
}

// Check if agent is registered in the AURA registry
async function checkIsRegistered(registryId: string, agentAddress: string): Promise<boolean> {
  try {
    const regObj = await SUI_CLIENT.getObject({ id: registryId, options: { showContent: true } });
    const content = regObj.data?.content as any;
    const tableId = content?.fields?.agents?.fields?.id?.id;
    if (!tableId) {
      console.warn("⚠️ Registry agents table not found in object content.");
      return false;
    }

    const df = await SUI_CLIENT.getDynamicFieldObject({
      parentId: tableId,
      name: { type: "address", value: agentAddress }
    });

    if (df.data && !df.error) {
      return true;
    }
  } catch (err) {
    console.warn(`⚠️ Failed to check agent registration:`, (err as Error).message);
  }
  return false;
}

// Setup and fund a specific agent (only if missing SUI gas, policy, or registration)
async function bootstrapAgent(
  ownerKeypair: Ed25519Keypair,
  agentKeypair: Ed25519Keypair,
  agentName: string,
  requiredDusdc: number,
  requiredGasMIST: number
) {
  const ownerAddress = ownerKeypair.toSuiAddress();
  const agentAddress = agentKeypair.toSuiAddress();
  console.log(cyan(`\n🤖 Auditing [${agentName}] (${agentAddress})`));

  // 1. Gas check & funding
  let balance = 0n;
  try {
    const balObj = await SUI_CLIENT.getBalance({ owner: agentAddress });
    balance = BigInt(balObj.totalBalance);
  } catch (e) {
    // Ignore and assume 0
  }

  if (balance < BigInt(requiredGasMIST)) {
    const transferAmount = BigInt(requiredGasMIST) - balance;
    console.log(yellow(`   Low gas balance (${(Number(balance)/1e9).toFixed(4)} SUI). Funding agent with ${(Number(transferAmount)/1e9).toFixed(4)} SUI...`));
    const tx = new Transaction();
    const [gasCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(transferAmount)]);
    tx.transferObjects([gasCoin], tx.pure.address(agentAddress));

    const txRes = await SUI_CLIENT.signAndExecuteTransaction({
      signer: ownerKeypair,
      transaction: tx,
    });
    await SUI_CLIENT.waitForTransaction({ digest: txRes.digest });
    console.log(green(`   Gas funded successfully. Digest: ${txRes.digest}`));
  } else {
    console.log(green(`   Gas check passed: ${(Number(balance)/1e9).toFixed(4)} SUI`));
  }

  // 2. Policy setup & funding
  let policyId = await findExistingPolicy(ownerAddress, agentAddress);

  if (!policyId) {
    console.log(yellow(`   No active policy found. Deploying new WalletPolicy...`));
    const tx1 = new Transaction();
    tx1.moveCall({
      target: `${AURA_PACKAGE_ID}::agent_wallet_policy::create_policy`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [
        tx1.pure.address(agentAddress),
        tx1.pure.u64(requiredDusdc), // Budget ceiling
        tx1.pure.vector("address", [DEEPBOOK_PREDICT_PACKAGE_ID]),
        tx1.pure.u64(10000000), // Far future expiration epoch
        tx1.pure.u64(0),
      ]
    });

    const tx1Res = await SUI_CLIENT.signAndExecuteTransaction({
      signer: ownerKeypair,
      transaction: tx1,
    });
    await SUI_CLIENT.waitForTransaction({ digest: tx1Res.digest });
    console.log(green(`   Policy created. Finding object ID...`));

    // Fetch effects to retrieve the newly created policy ID
    let policyObj;
    for (let i = 0; i < 10; i++) {
      try {
        const effects = await SUI_CLIENT.getTransactionBlock({
          digest: tx1Res.digest,
          options: { showObjectChanges: true }
        });
        policyObj = effects.objectChanges?.find(
          (c) => c.type === "created" && c.objectType.includes("WalletPolicy")
        );
        if (policyObj) break;
      } catch (e) {
        // ignore
      }
      await sleep(2000);
    }

    if (!policyObj || !("objectId" in policyObj)) {
      throw new Error("Failed to find new WalletPolicy object ID.");
    }
    policyId = policyObj.objectId;
    console.log(green(`   Created policy object ID: ${policyId}`));

    // Deposit dUSDC
    console.log(yellow(`   Depositing ${requiredDusdc / 1e9} dUSDC into policy wallet...`));
    const tx2 = new Transaction();
    const ownerCoins = await SUI_CLIENT.getCoins({ owner: ownerAddress, coinType: DUSDC_TYPE_TAG });
    const usableCoins = ownerCoins.data.filter(c => parseInt(c.balance, 10) > 0);
    usableCoins.sort((a, b) => parseInt(b.balance, 10) - parseInt(a.balance, 10));

    let totalAvailable = 0;
    const coinsToUse = [];
    for (const c of usableCoins) {
      totalAvailable += parseInt(c.balance, 10);
      coinsToUse.push(c);
      if (totalAvailable >= requiredDusdc) break;
    }

    if (totalAvailable < requiredDusdc) {
      throw new Error(`Owner has insufficient dUSDC balance. Required: ${requiredDusdc}, Available: ${totalAvailable}`);
    }

    let depositCoinArg;
    if (coinsToUse.length === 1) {
      const coinObj = coinsToUse[0];
      if (parseInt(coinObj.balance, 10) === requiredDusdc) {
        depositCoinArg = tx2.object(coinObj.coinObjectId);
      } else {
        const [split] = tx2.splitCoins(tx2.object(coinObj.coinObjectId), [tx2.pure.u64(requiredDusdc)]);
        depositCoinArg = split;
      }
    } else {
      const primaryCoin = coinsToUse[0].coinObjectId;
      tx2.mergeCoins(
        tx2.object(primaryCoin),
        coinsToUse.slice(1).map(c => tx2.object(c.coinObjectId))
      );
      const [split] = tx2.splitCoins(tx2.object(primaryCoin), [tx2.pure.u64(requiredDusdc)]);
      depositCoinArg = split;
    }

    tx2.moveCall({
      target: `${AURA_PACKAGE_ID}::agent_wallet_policy::deposit`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [tx2.object(policyId), depositCoinArg]
    });

    const tx2Res = await SUI_CLIENT.signAndExecuteTransaction({
      signer: ownerKeypair,
      transaction: tx2,
    });
    await SUI_CLIENT.waitForTransaction({ digest: tx2Res.digest });
    console.log(green(`   dUSDC Deposited successfully. Digest: ${tx2Res.digest}`));
  } else {
    // Audit existing policy balance
    try {
      const policyDetails = await SUI_CLIENT.getObject({ id: policyId, options: { showContent: true } });
      const balanceMIST = (policyDetails.data?.content as any)?.fields?.balance ?? "0";
      console.log(green(`   Policy check passed. ID: ${policyId} (Balance: ${Number(balanceMIST)/1e9} dUSDC)`));
    } catch (e) {
      console.log(yellow(`   Failed to inspect policy details. Assuming active.`));
    }
  }

  // 3. Register agent
  const isRegistered = await checkIsRegistered(REGISTRY_OBJECT_ID, agentAddress);
  if (!isRegistered) {
    console.log(yellow(`   Agent not registered in registry. Registering now...`));
    const tx3 = new Transaction();
    const [stakeCoin] = tx3.splitCoins(tx3.gas, [tx3.pure.u64(10_000_000)]); // 0.01 SUI stake bond
    tx3.moveCall({
      target: `${AURA_PACKAGE_ID}::aura_registry::register_agent`,
      arguments: [tx3.object(REGISTRY_OBJECT_ID), stakeCoin]
    });

    const tx3Res = await SUI_CLIENT.signAndExecuteTransaction({
      signer: agentKeypair,
      transaction: tx3,
    });
    await SUI_CLIENT.waitForTransaction({ digest: tx3Res.digest });
    console.log(green(`   Agent registered successfully. Digest: ${tx3Res.digest}`));
  } else {
    console.log(green(`   Agent registration check passed.`));
  }

  return { agentKeypair, policyId };
}

async function main() {
  console.log(magenta("========================================================="));
  console.log(magenta("🛡️  AURA Off-Chain Continuous Bot Runner Daemon           "));
  console.log(magenta("=========================================================\n"));

  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  console.log(`Owner Account: ${ownerAddress}\n`);

  console.log(green("🔄 Deriving agent keys and performing on-chain audit..."));
  
  // Derive 3 deterministic agents
  const key1 = deriveAgentKeypair(ownerKeypair, "conservative");
  const key2 = deriveAgentKeypair(ownerKeypair, "aggressive");
  const key3 = deriveAgentKeypair(ownerKeypair, "deltaneutral");

  // Bootstrap agents (SUI Gas + dUSDC + Registry registration)
  // Each agent gets 0.1 SUI and 25 dUSDC budget
  const agent1 = await bootstrapAgent(ownerKeypair, key1, "Conservative Yield Hunter", 25_000_000, 100_000_000);
  const agent2 = await bootstrapAgent(ownerKeypair, key2, "Aggressive Vol Trader", 25_000_000, 100_000_000);
  const agent3 = await bootstrapAgent(ownerKeypair, key3, "Delta-Neutral Bot", 25_000_000, 100_000_000);

  console.log(green("\n🚀 Start Continuous Autonomous Trading Loops (30-second cycles)"));
  console.log(`Press Ctrl+C to terminate runner.\n`);

  const runLoop = async (name: string, agentKeypair: Ed25519Keypair, policyId: string, delayMs: number) => {
    let iteration = 0;
    while (true) {
      iteration++;
      console.log(cyan(`\n[${new Date().toISOString()}] >>> [${name}] Waking up (Cycle #${iteration})`));
      
      let successOverride = true;
      if (name.includes("Aggressive")) {
        successOverride = Math.random() > 0.5; // 50% success
      } else if (name.includes("Delta-Neutral")) {
        successOverride = Math.random() > 0.1; // 90% success
      }
      
      try {
        console.log(`[${name}] Executing trade cycle...`);
        const res = await executeTradeCycle(agentKeypair, policyId, {
          mockMode: false,
          walrusMockFallback: false,
          successOverride,
        });
        if (res.success) {
          console.log(green(`[${name}] ✅ Trade cycle succeeded (Tx: ${res.txDigest})`));
        } else {
          console.log(red(`[${name}] ❌ Trade cycle execution failed.`));
        }
      } catch (error) {
        console.error(red(`[${name}] 💥 Fatal error in cycle:`), (error as Error).message);
      }

      console.log(`[${name}] Sleeping for ${delayMs/1000}s...`);
      await sleep(delayMs);
    }
  };

  // Stagger loops slightly to avoid transaction sequence collisions or gas conflicts
  runLoop("Conservative Yield", agent1.agentKeypair, agent1.policyId, 30000);
  await sleep(10000);
  runLoop("Aggressive Vol", agent2.agentKeypair, agent2.policyId, 30000);
  await sleep(10000);
  runLoop("Delta-Neutral", agent3.agentKeypair, agent3.policyId, 30000);
}

main().catch(err => {
  console.error(red("\n💥 Fatal error starting bot runner daemon:"), err);
  process.exit(1);
});
