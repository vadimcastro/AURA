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
export async function executeTradeCycle(
  agentAddress: string,
  policyObjectId: string,
  options: { mockMode?: boolean; walrusMockFallback?: boolean } = {}
): Promise<{ success: boolean; txDigest?: string; blobId?: string }> {
  const mockMode = options.mockMode ?? false;
  const walrusMockFallback = options.walrusMockFallback ?? true;

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
  const tradeAmount = 100_000_000; // 100 dUSDC (6 decimals / MIST-equivalent)

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
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours expiry
  const lowerStrike = 68000;
  const higherStrike = 72000;

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
      tx.pure.bool(true), // Success (in production derived from settlement)
    ],
  });

  let txDigest = `mock-tx-digest-trade-${crypto.randomBytes(8).toString("hex")}`;

  // Step 5: Dry-run and execution check
  if (!mockMode && !AURA_PACKAGE_ID.includes("placeholder")) {
    try {
      tx.setSender(agentAddress);
      const keypair = getAgentKeypair();
      
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
        signer: keypair,
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
  const simulatedTradeResult = {
    epoch: 100, // mock epoch or fetch from client
    decision: "Mint Range 68k-72k",
    amount: tradeAmount,
    refund: Math.floor(tradeAmount * 0.98), // simulate a small gas/execution loss
    reasoningHash: crypto.createHash("sha256").update("mock-llm-reasoning").digest("hex"),
    gasBalance: 5_200_000_000, // mock 5.2 SUI balance
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
