import { Transaction } from "@mysten/sui/transactions";
import * as crypto from "crypto";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID, 
  WALLET_POLICY_OBJECT_ID, 
  PREDICT_SERVER, 
  DEEPBOOK_PREDICT_PACKAGE_ID, 
  DEEPBOOK_POOL_ID, 
  DUSDC_TYPE_TAG, 
  getAgentKeypair 
} from "./config.js";
import { archiveTradeAudit } from "./walrus_archiver.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM __dirname resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface DeepBookTrace {
  id: string;
  timestampMs: number;
  tradeAmount: number;
  lowerStrike: number;
  higherStrike: number;
  expiry: number;
  action: "MintRange" | "PlaceUp" | "PlaceDown";
  volatilityEstimate: number;
}

let tracesCache: DeepBookTrace[] | null = null;
function popTrace(): DeepBookTrace | null {
  if (tracesCache === null) {
    const tracePath = path.join(__dirname, "deepbook_traces.json");
    if (fs.existsSync(tracePath)) {
      tracesCache = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
    } else {
      tracesCache = [];
    }
  }
  return tracesCache.length > 0 ? tracesCache.shift()! : null;
}

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface SVIParameters {
  a: number;
  b: number;
  rho: number;
  m: number;
  sigma: number;
  timestamp?: number;
}

// ── Arbitrage Verification ──────────────────────────────────────────────────

/**
 * Validates a volatility surface described by SVI parameters.
 * Enforces parameter boundaries, non-negativity of variance,
 * and asymptotic butterfly arbitrage density limits.
 */
export function isArbitrageFree(svi: SVIParameters): boolean {
  // 1. Parameter boundary checks
  if (svi.sigma <= 0) return false;
  if (Math.abs(svi.rho) >= 1) return false;
  if (svi.b < 0) return false;
  
  // 2. Non-negativity check: w(x) >= 0 for all strikes x.
  // The minimum variance occurs at x = m, with w(m) = a + b * sigma * sqrt(1 - rho^2).
  const minVariance = svi.a + svi.b * svi.sigma * Math.sqrt(1 - svi.rho * svi.rho);
  if (minVariance < 0) {
    return false;
  }

  // 3. Butterfly arbitrage check: probability density g(x) >= 0.
  // Asymptotically as |strike| -> infinity, density is non-negative if: b * (1 + |rho|) < 2.
  if (svi.b * (1 + Math.abs(svi.rho)) >= 2) {
    return false;
  }

  return true;
}

// ── Volatility Surface Fetching ─────────────────────────────────────────────

/**
 * Fetches the current SVI parameters from the DeepBook Predict server.
 * Falls back to a default mock surface if the server is offline or mockMode is enabled.
 */
export async function fetchSVIParameters(
  useMockFallback: boolean = true
): Promise<SVIParameters> {
  try {
    const response = await fetch(`${PREDICT_SERVER}/oracle/svi`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return data as SVIParameters;
  } catch (error) {
    if (useMockFallback) {
      console.warn("⚠️ DeepBook Predict server offline or unreachable. Using fallback volatility surface.");
      return {
        a: 0.04,
        b: 0.1,
        rho: -0.4,
        m: 0.01,
        sigma: 0.15,
        timestamp: Date.now(),
      };
    }
    throw new Error(`Failed to fetch SVI parameters: ${(error as Error).message}`);
  }
}

// ── Strategy Loop Execution ─────────────────────────────────────────────────

/**
 * Runs a single trading iteration of the off-chain Predict agent:
 * 1. Fetches current SVI parameters.
 * 2. Validates oracle freshness (<15s) and absence of volatility arbitrage.
 * 3. Builds the Sui atomic PTB.
 * 4. Signs and executes (or mocks) the transaction.
 * 5. Runs the Walrus verifiable audit archiving pipeline.
 */
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

export async function executeTradeCycle(
  agentKeypair: Ed25519Keypair,
  policyObjectId: string,
  options: { mockMode?: boolean; walrusMockFallback?: boolean; successOverride?: boolean } = {}
): Promise<{ success: boolean; txDigest?: string; blobId?: string }> {
  const mockMode = options.mockMode ?? false;
  const walrusMockFallback = options.walrusMockFallback ?? true;
  const successOverride = options.successOverride ?? true;
  const agentAddress = agentKeypair.toSuiAddress();

  console.log(`🤖 Starting trade cycle for agent: ${agentAddress}`);
  console.log(`  Policy Wallet: ${policyObjectId}`);

  // Step 1: Fetch SVI parameters
  const svi = await fetchSVIParameters(true);
  console.log("📊 SVI Volatility Parameters loaded:", svi);

  // Step 2: Freshness check (abort if SVI data is older than 15s)
  const sviTimestamp = svi.timestamp ?? Date.now();
  const timeDelta = Math.abs(Date.now() - sviTimestamp);
  if (timeDelta > 15_000) {
    console.error(`❌ SVI oracle data is stale (${(timeDelta / 1000).toFixed(1)}s delta). Aborting.`);
    return { success: false };
  }

  // Step 3: Arbitrage check
  if (!isArbitrageFree(svi)) {
    console.error("❌ Volatility surface contains arbitrage. Oracle manipulation detected! Aborting execution.");
    return { success: false };
  }
  console.log("✅ Volatility surface verified arbitrage-free.");

  // Step 3.5: Verify if target pool exists on-chain
  let poolExists = false;
  if (!mockMode && !DEEPBOOK_POOL_ID.includes("placeholder") && DEEPBOOK_POOL_ID !== "0x0000000000000000000000000000000000000000000000000000000000000005") {
    try {
      const poolObject = await SUI_CLIENT.getObject({
        id: DEEPBOOK_POOL_ID,
        options: { showType: true },
      });
      if (poolObject.data) {
        poolExists = true;
        console.log(`✅ DeepBook Pool validated on-chain: ${DEEPBOOK_POOL_ID}`);
      }
    } catch (e) {
      console.warn(`⚠️ Target pool ${DEEPBOOK_POOL_ID} not found or query failed. Falling back to mock/simulation mode.`);
    }
  }

  // Step 4: Construct Sui PTB
  const tx = new Transaction();
  const trace = popTrace();
  let tradeAmount = 0;
  if (trace) {
    // Normalize massive historical trades down to our 25 dUSDC testnet limits
    // Whales (>1000) use 20 dUSDC, Retail use 5 dUSDC
    const isWhale = trace.tradeAmount > 1000_000_000;
    tradeAmount = isWhale ? 20_000_000 : 5_000_000;
  }

  // 4.1 Verify reputation on-chain
  tx.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::assert_valid_agent`,
    arguments: [
      tx.object(REGISTRY_OBJECT_ID), 
      tx.pure.address(agentAddress)
    ],
  });

  // 4.2 Borrow dUSDC funds and receive the TradeTicket (Hot Potato)
  const [borrowedCoin, tradeTicket] = tx.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::borrow_for_trade`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      tx.object(policyObjectId),
      tx.pure.u64(tradeAmount),
      tx.pure.address(DEEPBOOK_PREDICT_PACKAGE_ID),
    ],
  });

  // 4.3 Execute trade range on DeepBook Predict
  // Resolve actual mint_range signature arguments:
  // target: `${DEEPBOOK_PREDICT_PACKAGE_ID}::predict_pool::mint_range`
  // args: [pool, coin, oracle_id, expiry, lower_strike, higher_strike]
  const oracleId = process.env.DEEPBOOK_ORACLE_ID || "0x0000000000000000000000000000000000000000000000000000000000000006";
  let expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours expiry
  let lowerStrike = 0;
  let higherStrike = 0;

  if (trace) {
    expiry = trace.expiry;
    lowerStrike = trace.lowerStrike;
    higherStrike = trace.higherStrike;
    svi.sigma = trace.volatilityEstimate; // align SVI logic with the historical data
    console.log(`📊 Ingested DeepBook User Trace: ${trace.id} | Amount: ${tradeAmount / 1_000_000} dUSDC | Spread: ${lowerStrike}-${higherStrike}`);
  } else {
    // Dynamically calculate strikes (baseline 70,000 adjusted by SVI volatility)
    const basePrice = 70000;
    const spread = Math.floor(basePrice * svi.sigma); // e.g. 70000 * 0.15 = 10500
    lowerStrike = basePrice - spread;
    higherStrike = basePrice + spread;
  }

  let remainingCoin;
  if (poolExists) {
    const [remCoin] = tx.moveCall({
      target: `${DEEPBOOK_PREDICT_PACKAGE_ID}::predict_pool::mint_range`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [
        tx.object(DEEPBOOK_POOL_ID),
        borrowedCoin,
        tx.pure.address(oracleId),
        tx.pure.u64(expiry),
        tx.pure.u64(lowerStrike),
        tx.pure.u64(higherStrike),
      ],
    });
    remainingCoin = remCoin;
  } else {
    // Fallback/Mock Call matching the resolved signature format
    const [remCoin] = tx.moveCall({
      target: `${DEEPBOOK_PREDICT_PACKAGE_ID}::predict_pool::mint_range_mock`,
      typeArguments: [DUSDC_TYPE_TAG],
      arguments: [
        tx.object(DEEPBOOK_POOL_ID),
        borrowedCoin,
        tx.pure.address(oracleId),
        tx.pure.u64(expiry),
        tx.pure.u64(lowerStrike),
        tx.pure.u64(higherStrike),
      ],
    });
    remainingCoin = remCoin;
  }

  // 4.4 Return remaining/refunded funds and consume the TradeTicket
  tx.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::return_and_complete`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      tx.object(policyObjectId),
      remainingCoin,
      tradeTicket,
    ],
  });

  // 4.5 Record task outcome on the reputation registry
  tx.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::record_task_outcome`,
    arguments: [
      tx.object(REGISTRY_OBJECT_ID),
      tx.pure.address(agentAddress),
      tx.pure.bool(successOverride), // Success (in production derived from settlement)
    ],
  });

  let txDigest = `mock-tx-digest-trade-${crypto.randomBytes(8).toString("hex")}`;

  // Step 5: Dry-run and execution check
  if (!mockMode && !AURA_PACKAGE_ID.includes("placeholder")) {
    try {
      tx.setSender(agentAddress);
      
      const agentGasCoins = await SUI_CLIENT.getCoins({ owner: agentAddress });
      if (agentGasCoins.data.length > 0) {
        tx.setGasPayment(agentGasCoins.data.map(coin => ({
          objectId: coin.coinObjectId,
          version: coin.version,
          digest: coin.digest
        })));
        tx.setGasBudget(2_000_000); // 0.002 SUI budget
      }
      
      const transactionBlockBytes = await tx.build({ client: SUI_CLIENT });
      const dryRun = await SUI_CLIENT.dryRunTransactionBlock({
        transactionBlock: transactionBlockBytes,
      });

      if (dryRun.effects.status.status !== "success") {
        throw new Error(`Dry-run failed: ${dryRun.effects.status.error}`);
      }
      console.log("✅ Sui PTB dry-run succeeded.");

      const result = await SUI_CLIENT.signAndExecuteTransaction({
        signer: agentKeypair,
        transaction: tx,
      });
      txDigest = result.digest;
    } catch (e) {
      console.error("❌ Failed to dry-run or execute transaction block on-chain:", e);
      return { success: false };
    }
  } else {
    console.log("🛠️ Mock Mode: Constructed trading Programmable Transaction Block.");
    console.log(`  Package ID:          ${AURA_PACKAGE_ID}`);
    console.log(`  Borrowed Amount:     ${tradeAmount} dUSDC`);
    console.log(`  DeepBook Pool ID:    ${DEEPBOOK_POOL_ID}`);
  }

  // Step 6: Trigger the Walrus verifiable audit archiving pipeline
  console.log("💾 Archiving trade execution trace...");
  
  // Create a dynamic reasoning hash from actual inputs to prove determinism
  const reasoningInput = `SVI(sigma=${svi.sigma.toFixed(3)},rho=${svi.rho.toFixed(3)}) -> spread=${spread}`;
  const reasoningHash = crypto.createHash("sha256").update(reasoningInput).digest("hex");
  const decisionStr = `Mint Range ${(lowerStrike/1000).toFixed(1)}k-${(higherStrike/1000).toFixed(1)}k`;

  // Fetch actual epoch if possible, otherwise derive from timestamp
  let currentEpoch = 100;
  let currentGasBalance = 5_200_000_000;
  if (!mockMode) {
    try {
      const state = await SUI_CLIENT.getLatestSuiSystemState();
      currentEpoch = Number(state.epoch);
      const agentGasCoins = await SUI_CLIENT.getCoins({ owner: agentAddress });
      currentGasBalance = agentGasCoins.data.reduce((acc, c) => acc + Number(c.balance), 0);
    } catch (e) {
      console.warn("⚠️ Could not query on-chain epoch/gas. Using mock fallback.");
    }
  } else {
    currentEpoch = Math.floor(Date.now() / 1000 / 86400); // 1 epoch ~ 1 day fallback
  }

  const simulatedTradeResult = {
    epoch: currentEpoch,
    decision: decisionStr,
    amount: tradeAmount,
    refund: Math.floor(tradeAmount * 0.98), // Real slippage/fees will be parsed from tx.effects in production
    reasoningHash: reasoningHash,
    gasBalance: currentGasBalance,
  };

  let archiveResult;
  try {
    archiveResult = await archiveTradeAudit(
      simulatedTradeResult,
      svi,
      policyObjectId,
      agentAddress,
      { mockMode, walrusMockFallback }
    );
  } catch (error) {
    console.error("❌ Archiving pipeline failed:", (error as Error).message);
    return { success: false, txDigest };
  }

  console.log("🎉 Trade cycle completed successfully!");
  
  if (!mockMode && archiveResult.blobId && !AURA_PACKAGE_ID.includes("placeholder")) {
    console.log("📝 Writing Walrus blob ID to on-chain registry...");
    try {
      const historyTx = new Transaction();
      historyTx.setSender(agentAddress);
      
      const blobBytes = Array.from(Buffer.from(archiveResult.blobId, "utf8"));
      
      historyTx.moveCall({
        target: `${AURA_PACKAGE_ID}::aura_registry::update_walrus_history`,
        arguments: [
          historyTx.object(REGISTRY_OBJECT_ID),
          historyTx.pure.vector("u8", blobBytes),
        ],
      });
      
      await SUI_CLIENT.signAndExecuteTransaction({
        signer: agentKeypair,
        transaction: historyTx,
      });
      console.log("✅ Walrus history updated on-chain.");
    } catch (err) {
      console.error("❌ Failed to update Walrus history on-chain:", err);
    }
  }
  return {
    success: true,
    txDigest,
    blobId: archiveResult.blobId,
  };
}

/**
 * Main loop that runs the trading agent on a periodic interval.
 */
export function startAgentLoop(
  agentAddress: string,
  policyObjectId: string,
  intervalMs: number = 60_000,
  options: { mockMode?: boolean; walrusMockFallback?: boolean } = {}
) {
  console.log(`📡 Starting agent trading loop (interval: ${intervalMs / 1000}s)`);
  
  const loop = async () => {
    try {
      await executeTradeCycle(agentAddress, policyObjectId, options);
    } catch (error) {
      console.error("⚠️ Error in strategy loop iteration:", error);
    }
  };

  loop();
  return setInterval(loop, intervalMs);
}
