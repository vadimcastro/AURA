import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID,
  DEEPBOOK_PREDICT_PACKAGE_ID,
  DUSDC_TYPE_TAG,
  getAgentKeypair 
} from "./config.js";
import { executeTradeCycle } from "./predict_agent.js";
import { downloadFromWalrus, decryptWithSeal } from "./walrus_archiver.js";

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
    const [stakeCoin] = tx3.splitCoins(tx3.gas, [tx3.pure.u64(100_000_000)]); // 0.1 SUI stake bond
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

async function runSweep(ownerKeypair: Ed25519Keypair): Promise<number> {
  const ownerAddress = ownerKeypair.toSuiAddress();
  const targetPackages = [
    AURA_PACKAGE_ID,
    "0x7cb617c78407fdae14a8e51f12da5cd7c7abf2dc67f6c0c58c5fdb8ce40dd922",
    "0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef"
  ];
  let policiesRecovered = 0;

  for (const pkgId of targetPackages) {
    if (pkgId.includes("placeholder")) continue;
    let hasNextPage = true;
    let cursor: any = null;

    while (hasNextPage) {
      try {
        const events = await SUI_CLIENT.queryEvents({
          query: { MoveEventType: `${pkgId}::agent_wallet_policy::PolicyCreated` },
          cursor,
          limit: 50
        });

        for (const ev of events.data) {
          if (ev.sender !== ownerAddress) continue;
          const policyId = (ev.parsedJson as any)?.policy_id;
          if (!policyId) continue;
          
          try {
            const tx = new Transaction();
            tx.moveCall({
              target: `${pkgId}::agent_wallet_policy::revoke_policy`,
              typeArguments: [DUSDC_TYPE_TAG],
              arguments: [tx.object(policyId)]
            });

            const txRes = await SUI_CLIENT.signAndExecuteTransaction({
              signer: ownerKeypair,
              transaction: tx,
            });
            await SUI_CLIENT.waitForTransaction({ digest: txRes.digest });
            policiesRecovered++;
          } catch (err) {
            // Already revoked or deleted
          }
        }
        hasNextPage = events.hasNextPage;
        cursor = events.nextCursor ?? null;
      } catch (err) {
        hasNextPage = false;
      }
    }
  }
  return policiesRecovered;
}

import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || "aura-admin-secret-pass";

app.use(express.json());

// CORS configuration to allow Vercel frontend control
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-api-key");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const apiKey = req.headers["x-api-key"];
  if (apiKey !== ADMIN_API_KEY) {
    return res.status(401).json({ error: "Unauthorized. Invalid Admin API Key." });
  }
  next();
};

let activeIntervals: NodeJS.Timeout[] = [];
let loopRunning = false;

// Global circuit breaker, idempotency, and HITL state variables
let consecutiveFailures = 0;
let circuitBreakerTripped = false;
let isEscalated = false;
let escalationResolver: (() => void) | null = null;
const lastBlobIdMap: Record<string, string> = {};

// Idempotency query function
async function isTransactionCommitted(agentAddress: string, uuid: string): Promise<boolean> {
  try {
    console.log(`🔍 Idempotency Check: Querying transaction history for ${agentAddress} matching ${uuid}...`);
    const txBlocks = await SUI_CLIENT.queryTransactionBlocks({
      filter: { FromAddress: agentAddress },
      options: { showInput: true },
      limit: 20
    });
    for (const tx of txBlocks.data) {
      const txStr = JSON.stringify(tx);
      if (txStr.includes(uuid)) {
        console.log(yellow(`⚠️ Idempotency check: Found transaction ${tx.digest} containing UUID ${uuid}. Already committed!`));
        return true;
      }
    }
  } catch (err) {
    console.warn(`⚠️ Failed to query transaction history for idempotency check:`, err);
  }
  return false;
}

app.get("/api/status", async (req, res) => {
  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  
  let ownerSui = 0n;
  let ownerUsdc = 0n;
  try {
    const balS = await SUI_CLIENT.getBalance({ owner: ownerAddress });
    const balU = await SUI_CLIENT.getBalance({ owner: ownerAddress, coinType: DUSDC_TYPE_TAG });
    ownerSui = BigInt(balS.totalBalance);
    ownerUsdc = BigInt(balU.totalBalance);
  } catch (e) {}

  res.json({
    status: circuitBreakerTripped ? "CIRCUIT_BREAKER_TRIPPED" : (loopRunning ? "RUNNING" : "STOPPED"),
    isEscalated,
    ownerAddress,
    ownerBalances: {
      sui: (Number(ownerSui) / 1e9).toFixed(4),
      dUSDC: (Number(ownerUsdc) / 1e9).toFixed(4)
    },
    activeIntervalsCount: activeIntervals.length
  });
});

app.post("/api/resume", requireAuth, (req, res) => {
  if (!isEscalated) {
    return res.json({ message: "No active escalation to resume." });
  }
  if (escalationResolver) {
    escalationResolver();
    escalationResolver = null;
  }
  isEscalated = false;
  loopRunning = true;
  console.log(green("✅ Escalation resolved by owner. Resuming execution..."));
  res.json({ success: true, message: "Agent execution resumed." });
});

app.get("/api/escalations", (req, res) => {
  const escalationLogPath = path.join(__dirname, "escalations.json");
  if (fs.existsSync(escalationLogPath)) {
    try {
      const list = JSON.parse(fs.readFileSync(escalationLogPath, "utf8"));
      return res.json(list);
    } catch (e) {}
  }
  res.json([]);
});

app.post("/api/escalations/approve", requireAuth, (req, res) => {
  const { id } = req.body;
  const escalationLogPath = path.join(__dirname, "escalations.json");
  if (fs.existsSync(escalationLogPath)) {
    try {
      let list = JSON.parse(fs.readFileSync(escalationLogPath, "utf8"));
      list = list.map((item: any) => {
        if (item.id === id) item.status = "APPROVED";
        return item;
      });
      fs.writeFileSync(escalationLogPath, JSON.stringify(list, null, 2));
    } catch (e) {}
  }
  if (escalationResolver) {
    escalationResolver();
    escalationResolver = null;
  }
  isEscalated = false;
  loopRunning = true;
  console.log(green(`✅ Escalation ${id} approved by owner. Resuming execution...`));
  res.json({ success: true, message: "Escalation approved, loops resumed." });
});

app.get("/api/telemetry/decrypt", async (req, res) => {
  const blobId = req.query.blobId as string;
  if (!blobId) {
    return res.status(400).json({ error: "Missing blobId query parameter" });
  }

  try {
    console.log(`🌐 API Telemetry: Decrypting Walrus blob ${blobId}...`);
    // Determine mock status based on env vars
    const mockMode = process.env.WALRUS_MOCK === "true";
    const encryptedTrace = await downloadFromWalrus(blobId, mockMode);
    const decryptedBytes = await decryptWithSeal(encryptedTrace);
    const decryptedStr = new TextDecoder().decode(decryptedBytes);
    
    try {
      const traceJson = JSON.parse(decryptedStr);
      res.json({ success: true, decrypted: traceJson });
    } catch {
      res.json({ success: true, raw: decryptedStr });
    }
  } catch (err) {
    console.error(`❌ Telemetry decryption failed for blob ${blobId}:`, err);
    res.status(500).json({ error: (err as Error).message });
  }
});

const paymasterLimiter: Record<string, { count: number; resetTime: number }> = {};

app.post("/api/paymaster/sponsor", async (req, res) => {
  const { txBytes } = req.body;
  if (!txBytes) {
    return res.status(400).json({ error: "Missing txBytes in request body" });
  }

  try {
    const txBytesUint8 = Buffer.from(txBytes, "base64");
    const tx = Transaction.from(txBytesUint8);
    const data = (tx as any).getData ? (tx as any).getData() : null;
    const commands = data?.commands || data?.transactions || [];

    for (const cmd of commands) {
      let target = "";
      if (cmd.kind === "MoveCall" && cmd.target) {
        target = cmd.target;
      } else if (cmd.MoveCall && cmd.MoveCall.package) {
        target = `${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`;
      } else if (cmd.$kind === "MoveCall" && cmd.MoveCall) {
        target = `${cmd.MoveCall.package}::${cmd.MoveCall.module}::${cmd.MoveCall.function}`;
      }

      if (target) {
        const parts = target.split("::");
        const packageId = parts[0];
        const cleanPackage = packageId.replace(/^0x0*/, "").toLowerCase();
        const cleanAura = AURA_PACKAGE_ID.replace(/^0x0*/, "").toLowerCase();
        const cleanDeepbook = DEEPBOOK_PREDICT_PACKAGE_ID.replace(/^0x0*/, "").toLowerCase();
        
        if (cleanPackage !== cleanAura && cleanPackage !== cleanDeepbook) {
          return res.status(400).json({
            error: `Security Alert: Paymaster can only sponsor transactions calling allowlisted packages (AURA or DeepBook). Target: ${target}`
          });
        }
      }
    }

    // Rate limiter: max 5 requests per 24 hours per IP
    const ip = req.ip || "unknown";
    const now = Date.now();
    const rateWindow = 86400000; // 24 hours
    const limitCount = 5;

    const limitData = paymasterLimiter[ip] || { count: 0, resetTime: now + rateWindow };
    if (now > limitData.resetTime) {
      limitData.count = 1;
      limitData.resetTime = now + rateWindow;
    } else {
      limitData.count += 1;
    }
    paymasterLimiter[ip] = limitData;

    if (limitData.count > limitCount) {
      return res.status(429).json({ error: "Daily paymaster quota exceeded. Please try again tomorrow." });
    }

    // Sign the transaction bytes as the gas sponsor using the platform keypair
    const sponsorKeypair = getAgentKeypair();
    const { signature } = await sponsorKeypair.signTransaction(txBytesUint8);

    console.log(green(`📡 Paymaster sponsored transaction block for IP ${ip}. Sponsor: ${sponsorKeypair.toSuiAddress()}`));
    res.json({ success: true, signature });
  } catch (err) {
    console.error("❌ Paymaster sponsorship failed:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});


app.post("/api/start", requireAuth, async (req, res) => {
  if (loopRunning) {
    return res.json({ message: "Loop is already running." });
  }

  circuitBreakerTripped = false;
  consecutiveFailures = 0;
  isEscalated = false;

  const delayMs = parseInt(req.body.intervalMs as string, 10) || 30000;
  loopRunning = true;
  console.log(`📡 Control API triggered start: Running bots in background (Interval: ${delayMs/1000}s)`);
  
  const ownerKeypair = getAgentKeypair();
  const key1 = deriveAgentKeypair(ownerKeypair, "conservative");
  const key2 = deriveAgentKeypair(ownerKeypair, "aggressive");
  const key3 = deriveAgentKeypair(ownerKeypair, "deltaneutral");

  try {
    const agent1 = await bootstrapAgent(ownerKeypair, key1, "Conservative Yield Hunter", 25_000_000, 100_000_000);
    const agent2 = await bootstrapAgent(ownerKeypair, key2, "Aggressive Vol Trader", 25_000_000, 100_000_000);
    const agent3 = await bootstrapAgent(ownerKeypair, key3, "Delta-Neutral Bot", 25_000_000, 100_000_000);

    const runCycle = async (name: string, keypair: Ed25519Keypair, policyId: string) => {
      if (!loopRunning || circuitBreakerTripped) return;

      if (isEscalated) {
        console.log(yellow(`[${name}] Pausing execution loop due to active HITL escalation.`));
        await new Promise<void>((resolve) => {
          escalationResolver = resolve;
        });
      }

      const agentAddress = keypair.toSuiAddress();
      const idempotencyUuid = crypto.randomUUID();
      console.log(cyan(`\n🔄 [${name}] Starting cycle with Idempotency UUID: ${idempotencyUuid}`));

      let successOverride = true;
      if (name.includes("Aggressive")) {
        successOverride = Math.random() > 0.5;
      } else if (name.includes("Delta-Neutral")) {
        successOverride = Math.random() > 0.1;
      }

      const maxRetries = 3;
      let attempt = 0;
      let backoffMs = 2000;
      let lastBlobId = lastBlobIdMap[name];

      while (attempt < maxRetries) {
        attempt++;
        try {
          if (attempt > 1) {
            console.log(yellow(`🔄 [${name}] Retry Attempt ${attempt}/${maxRetries} after ${backoffMs}ms...`));
            await sleep(backoffMs);
            backoffMs *= 2;

            const alreadyCommitted = await isTransactionCommitted(agentAddress, idempotencyUuid);
            if (alreadyCommitted) {
              console.log(green(`✅ [${name}] Transaction with UUID ${idempotencyUuid} was already committed. Skipping retry.`));
              consecutiveFailures = 0;
              return;
            }
          }

          console.log(`[${name}] Executing trade cycle (Attempt ${attempt})...`);
          const result = await executeTradeCycle(keypair, policyId, {
            mockMode: false,
            walrusMockFallback: false,
            successOverride,
            lastBlobId,
            idempotencyUuid,
          });

          if (!result.success) {
            throw new Error("executeTradeCycle returned success=false");
          }

          consecutiveFailures = 0;
          if (result.blobId) {
            lastBlobIdMap[name] = result.blobId;
          }

          // HITL confidence escalation
          const CONFIDENCE_THRESHOLD = 0.60;
          const confidence = result.confidence ?? 0.85;
          if (confidence < CONFIDENCE_THRESHOLD) {
            console.log(red(`🚨 [${name}] Escalated to Human Owner: Low Confidence (${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD})`));
            isEscalated = true;
            loopRunning = false;

            // 9.13 - Log sandbox alerts to a local escalations.json file
            try {
              const escalationLogPath = path.join(__dirname, "escalations.json");
              const newEscalation = {
                id: crypto.randomUUID(),
                timestamp: Date.now(),
                agentName: name,
                reason: confidence <= 0.40 ? "TS Sandbox bounds check failed / logical hallucination caught" : "Low confidence score",
                confidence: confidence,
                status: "PENDING"
              };
              let escalations = [];
              if (fs.existsSync(escalationLogPath)) {
                escalations = JSON.parse(fs.readFileSync(escalationLogPath, "utf8"));
              }
              escalations.push(newEscalation);
              fs.writeFileSync(escalationLogPath, JSON.stringify(escalations, null, 2));
              console.log(yellow("💾 Sandbox escalation successfully written to escalations.json."));
            } catch (escalationErr) {
              console.error("❌ Failed to log escalation event:", escalationErr);
            }
            break;
          }

          return;

        } catch (err) {
          console.error(red(`❌ [${name}] Attempt ${attempt} failed: ${(err as Error).message}`));
          consecutiveFailures++;

          if (consecutiveFailures >= 3) {
            circuitBreakerTripped = true;
            loopRunning = false;
            activeIntervals.forEach(clearInterval);
            activeIntervals = [];
            console.error(red(`\n💥💥💥 CIRCUIT BREAKER TRIPPED after 3 consecutive failures. Halting all loops. 💥💥💥`));
            
            // Log circuit breaker event to Walrus
            try {
              const simulatedTradeResult = {
                epoch: 100,
                decision: "CIRCUIT_BREAKER_TRIPPED",
                amount: 0,
                refund: 0,
                reasoningHash: crypto.createHash("sha256").update("CIRCUIT_BREAKER_TRIPPED").digest("hex"),
                gasBalance: 5000000000,
              };
              const svi = { a: 0, b: 0, rho: 0, m: 0, sigma: 0 };
              const { archiveTradeAudit } = await import("./walrus_archiver.js");
              await archiveTradeAudit(simulatedTradeResult, svi, policyId, keypair, { mockMode: true, walrusMockFallback: true });
              console.log(yellow("💾 CIRCUIT_BREAKER_TRIPPED event trace successfully written to Walrus."));
            } catch (archiveErr) {
              console.error("❌ Failed to log breaker event to Walrus:", archiveErr);
            }
            break;
          }
        }
      }
    };

    const t1 = setInterval(() => runCycle("Conservative Yield", agent1.agentKeypair, agent1.policyId), delayMs);
    await sleep(2000);
    const t2 = setInterval(() => runCycle("Aggressive Vol", agent2.agentKeypair, agent2.policyId), delayMs);
    await sleep(2000);
    const t3 = setInterval(() => runCycle("Delta-Neutral", agent3.agentKeypair, agent3.policyId), delayMs);

    activeIntervals = [t1, t2, t3];
    
    runCycle("Conservative Yield", agent1.agentKeypair, agent1.policyId);
    sleep(2000).then(() => runCycle("Aggressive Vol", agent2.agentKeypair, agent2.policyId));
    sleep(4000).then(() => runCycle("Delta-Neutral", agent3.agentKeypair, agent3.policyId));

    res.json({ success: true, message: "Backend execution loop started successfully." });
  } catch (err) {
    loopRunning = false;
    res.status(500).json({ error: `Failed to start bots: ${(err as Error).message}` });
  }
});

app.post("/api/stop", requireAuth, (req, res) => {
  if (!loopRunning) {
    return res.json({ message: "Loop is already stopped." });
  }
  
  activeIntervals.forEach(clearInterval);
  activeIntervals = [];
  loopRunning = false;
  console.log("📡 Control API triggered stop: Paused continuous bots loop.");
  res.json({ success: true, message: "Backend execution loop stopped." });
});

app.post("/api/recover", requireAuth, async (req, res) => {
  console.log("📡 Control API triggered sweep: Sweeping all policy wallets...");
  try {
    const ownerKeypair = getAgentKeypair();
    const count = await runSweep(ownerKeypair);
    res.json({ success: true, message: `Reclaim completed. Swept ${count} policy wallets.` });
  } catch (err) {
    res.status(500).json({ error: `Sweep failed: ${(err as Error).message}` });
  }
});

app.post("/api/stripe/create-session", async (req, res) => {
  const { walletAddress } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: "Missing walletAddress in request body" });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeSecretKey) {
    return res.status(500).json({ error: "Stripe is not configured on this server (missing STRIPE_SECRET_KEY)" });
  }

  try {
    console.log(`💳 Creating Stripe Crypto Onramp Session for wallet ${walletAddress}...`);
    
    // Construct form-data body for Stripe API
    const params = new URLSearchParams();
    params.append("destination_currency", "usdc");
    params.append("destination_network", "sui");
    params.append("wallet_addresses[sui]", walletAddress);
    
    const response = await fetch("https://api.stripe.com/v1/crypto/onramp_sessions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2022-11-15"
      },
      body: params.toString()
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ Stripe API returned status ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: `Stripe API error: ${errorText}` });
    }

    const sessionData = await response.json() as any;
    console.log(`✅ Stripe Crypto Onramp Session created. Client Secret: ${sessionData.client_secret ? "Present" : "Missing"}`);
    
    res.json({
      success: true,
      clientSecret: sessionData.client_secret
    });
  } catch (err) {
    console.error("❌ Failed to create Stripe Crypto Onramp Session:", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🚀 AURA Daemon Server listening on port ${PORT}`);
  console.log(`   Admin API Endpoints are protected by header 'x-api-key'\n`);
});
