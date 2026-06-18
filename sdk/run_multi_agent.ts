import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
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

async function setupAgent(ownerKeypair: Ed25519Keypair, agentName: string, dusdcAmount: number, suiGasAmount: number) {
  const agentKeypair = new Ed25519Keypair();
  const agentAddress = agentKeypair.toSuiAddress();
  console.log(cyan(`\n🤖 Setting up [${agentName}] - Address: ${agentAddress}`));

  const ownerAddress = ownerKeypair.toSuiAddress();

  // 1. Send SUI and Create Policy
  const tx1 = new Transaction();
  const [gasCoin] = tx1.splitCoins(tx1.gas, [tx1.pure.u64(suiGasAmount)]);
  tx1.transferObjects([gasCoin], tx1.pure.address(agentAddress));

  tx1.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::create_policy`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      tx1.pure.address(agentAddress),
      tx1.pure.u64(dusdcAmount), // Budget limit
      tx1.pure.vector("address", [DEEPBOOK_PREDICT_PACKAGE_ID]),
      tx1.pure.u64(1000000), // Far future expiration
      tx1.pure.u64(0),
    ]
  });

  const tx1Res = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: tx1,
  });
  console.log(yellow(`   Policy creation & Gas funding sent. Digest: ${tx1Res.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: tx1Res.digest });

  let policyObject;
  for (let i = 0; i < 15; i++) {
    try {
      const effects = await SUI_CLIENT.getTransactionBlock({
        digest: tx1Res.digest,
        options: { showObjectChanges: true }
      });
      policyObject = effects.objectChanges?.find(
        (c) => c.type === "created" && c.objectType.includes("WalletPolicy")
      );
      if (policyObject) break;
    } catch (e) {
      // ignore
    }
    await sleep(3000);
  }

  if (!policyObject || !("objectId" in policyObject)) {
    throw new Error("Failed to find Policy Object.");
  }
  const policyId = policyObject.objectId;

  // 2. Deposit dUSDC
  const tx2 = new Transaction();

  // Query fresh dUSDC coins owned by the owner address to ensure correct versioning
  const ownerCoins = await SUI_CLIENT.getCoins({ owner: ownerAddress, coinType: DUSDC_TYPE_TAG });
  const usableCoins = ownerCoins.data.filter(c => parseInt(c.balance, 10) > 0);
  usableCoins.sort((a, b) => parseInt(b.balance, 10) - parseInt(a.balance, 10));

  let totalAvailable = 0;
  const coinsToUse = [];
  for (const c of usableCoins) {
    totalAvailable += parseInt(c.balance, 10);
    coinsToUse.push(c);
    if (totalAvailable >= dusdcAmount) break;
  }

  if (totalAvailable < dusdcAmount) {
    throw new Error(`Owner has insufficient dUSDC balance. Required: ${dusdcAmount}, Available: ${totalAvailable}`);
  }

  let depositCoinArg;
  if (coinsToUse.length === 1) {
    const coinObj = coinsToUse[0];
    if (parseInt(coinObj.balance, 10) === dusdcAmount) {
      depositCoinArg = tx2.object(coinObj.coinObjectId);
    } else {
      const [split] = tx2.splitCoins(tx2.object(coinObj.coinObjectId), [tx2.pure.u64(dusdcAmount)]);
      depositCoinArg = split;
    }
  } else {
    const primaryCoin = coinsToUse[0].coinObjectId;
    tx2.mergeCoins(
      tx2.object(primaryCoin),
      coinsToUse.slice(1).map(c => tx2.object(c.coinObjectId))
    );
    const [split] = tx2.splitCoins(tx2.object(primaryCoin), [tx2.pure.u64(dusdcAmount)]);
    depositCoinArg = split;
  }

  tx2.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::deposit`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      tx2.object(policyId),
      depositCoinArg
    ]
  });

  const tx2Res = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: tx2,
  });
  console.log(yellow(`   dUSDC Deposit sent. Digest: ${tx2Res.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: tx2Res.digest });

  // 3. Register Agent on-chain
  const tx3 = new Transaction();
  const [stakeCoin] = tx3.splitCoins(tx3.gas, [tx3.pure.u64(10_000_000)]); // 0.01 SUI
  tx3.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::register_agent`,
    arguments: [
      tx3.object(REGISTRY_OBJECT_ID),
      stakeCoin
    ]
  });
  const tx3Res = await SUI_CLIENT.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: tx3,
  });
  console.log(yellow(`   Agent Registered on-chain. Digest: ${tx3Res.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: tx3Res.digest });

  return { agentKeypair, policyId };
}

async function main() {
  console.log(magenta("========================================================="));
  console.log(magenta("     AURA Multi-Agent Simulation & Load Test Loop        "));
  console.log(magenta("=========================================================\n"));

  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  console.log(`Owner Address: ${ownerAddress}`);

  console.log(green("\n[Phase 1] Bootstrapping 3 distinct Agents..."));
  // Split 25 dUSDC per agent, 0.2 SUI for gas
  const agent1 = await setupAgent(ownerKeypair, "Conservative Yield Hunter", 25_000_000, 100_000_000);
  const agent2 = await setupAgent(ownerKeypair, "Aggressive Vol Trader", 25_000_000, 100_000_000);
  const agent3 = await setupAgent(ownerKeypair, "Delta-Neutral Bot", 25_000_000, 100_000_000);

  console.log(green("\n[Phase 2] Starting Continuous Autonomous Trading Loops..."));

  // Start concurrent loops
  const runLoop = async (name: string, agent: any, delayMs: number) => {
    while (true) {
      console.log(cyan(`\n>>> [${name}] Waking up to execute trade cycle...`));
      let successOverride = true;
      if (name.includes("Aggressive")) {
        successOverride = Math.random() > 0.5; // 50% success
      } else if (name.includes("Delta-Neutral")) {
        successOverride = Math.random() > 0.1; // 90% success
      }
      
      try {
        await executeTradeCycle(agent.agentKeypair, agent.policyId, {
          mockMode: false,
          walrusMockFallback: false,
          successOverride,
        });
      } catch (error) {
        console.error(red(`[${name}] Trade cycle failed:`), error);
      }
      console.log(`[${name}] Sleeping for ${delayMs/1000}s...`);
      await sleep(delayMs);
    }
  };

  runLoop("Conservative", agent1, 30000); // Every 30s
  await sleep(10000); // Stagger starts
  runLoop("Aggressive", agent2, 30000); // Every 30s
  await sleep(10000);
  runLoop("Delta-Neutral", agent3, 30000); // Every 30s
}

main().catch(console.error);
