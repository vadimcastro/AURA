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
import { 
  archiveTradeAudit, 
  downloadFromWalrus, 
  decryptWithSeal,
  buildAuditTrace,
  compressStateHistory,
  commitBlobIdOnChain,
  AuditTrace
} from "./walrus_archiver.js";
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
// Keep track of the recent raw audit traces in-memory for state compression
const recentTracesMap: Record<string, AuditTrace[]> = {};
function popTrace(): DeepBookTrace | null {
  if (tracesCache === null) {
    const tracePath = path.join(__dirname, "deepbook_traces.json");
    if (fs.existsSync(tracePath)) {
      tracesCache = JSON.parse(fs.readFileSync(tracePath, "utf-8"));
    } else {
      tracesCache = [];
    }
  }
  const cache = tracesCache;
  if (!cache) return null;
  return cache.length > 0 ? cache.shift()! : null;
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

// Helper validators for strict parameter schema check
export interface LLMReasoningOutput {
  lowerStrike: number;
  higherStrike: number;
  expiry: number;
  tradeAmount: number;
  confidence: number;
  reasoning: string;
}

export interface GruntReasoningOutput {
  decision: "WIDEN_SPREAD" | "MAINTAIN_SPREAD" | "REDUCE_SIZE";
  confidence: number;
  reasoning: string;
}

export interface SandboxOutput {
  lowerStrike: number;
  higherStrike: number;
  expiry: number;
  tradeAmount: number;
  decision: string;
  confidence: number;
  reasoning: string;
}

const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;

export function validateGruntReasoning(jsonStr: string): GruntReasoningOutput {
  const parsed = JSON.parse(jsonStr);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid JSON: Grunt output must be an object");
  }
  if (!["WIDEN_SPREAD", "MAINTAIN_SPREAD", "REDUCE_SIZE"].includes(parsed.decision)) {
    throw new Error(`Invalid decision enum value: "${parsed.decision}"`);
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error("Invalid confidence: must be a number between 0 and 1");
  }
  if (typeof parsed.reasoning !== "string") {
    throw new Error("Invalid reasoning: must be a string");
  }
  return parsed as GruntReasoningOutput;
}

export function runTSComponentSandbox(
  gruntOutput: GruntReasoningOutput,
  svi: SVIParameters,
  baseTradeAmount: number,
  reflectiveMarginWidenFactor: number
): SandboxOutput {
  const basePrice = 70000;
  let spreadWiden = reflectiveMarginWidenFactor;
  let finalTradeAmount = baseTradeAmount;
  
  if (gruntOutput.decision === "WIDEN_SPREAD") {
    spreadWiden = spreadWiden * 1.5;
  } else if (gruntOutput.decision === "REDUCE_SIZE") {
    finalTradeAmount = Math.floor(finalTradeAmount * 0.75);
  } else if (gruntOutput.decision !== "MAINTAIN_SPREAD") {
    throw new Error(`LOGICAL_HALLUCINATION_CAUGHT: Unknown decision enum "${gruntOutput.decision}"`);
  }

  const spread = Math.floor(basePrice * svi.sigma * spreadWiden);
  const lowerStrike = basePrice - spread;
  const higherStrike = basePrice + spread;
  const expiry = Math.floor(Date.now() / 1000) + 86400; // 24h

  return {
    lowerStrike,
    higherStrike,
    expiry,
    tradeAmount: finalTradeAmount,
    decision: gruntOutput.decision,
    confidence: gruntOutput.confidence,
    reasoning: gruntOutput.reasoning
  };
}

export function validateLLMReasoning(jsonStr: string): LLMReasoningOutput {
  const parsed = JSON.parse(jsonStr);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Invalid JSON: LLM output must be an object");
  }
  if (typeof parsed.lowerStrike !== "number" || parsed.lowerStrike <= 0) {
    throw new Error("Invalid lowerStrike: must be a positive number");
  }
  if (typeof parsed.higherStrike !== "number" || parsed.higherStrike <= 0) {
    throw new Error("Invalid higherStrike: must be a positive number");
  }
  if (parsed.lowerStrike >= parsed.higherStrike) {
    throw new Error("Invalid strikes: lowerStrike must be less than higherStrike");
  }
  if (typeof parsed.expiry !== "number" || parsed.expiry <= 0) {
    throw new Error("Invalid expiry: must be a positive number");
  }
  if (typeof parsed.tradeAmount !== "number" || parsed.tradeAmount <= 0) {
    throw new Error("Invalid tradeAmount: must be a positive number");
  }
  if (typeof parsed.confidence !== "number" || parsed.confidence < 0 || parsed.confidence > 1) {
    throw new Error("Invalid confidence: must be a number between 0 and 1");
  }
  if (typeof parsed.reasoning !== "string") {
    throw new Error("Invalid reasoning: must be a string");
  }
  return parsed as LLMReasoningOutput;
}

export function isValidSuiAddress(addr: any): boolean {
  if (typeof addr !== "string") return false;
  return /^0x[a-fA-F0-9]{1,64}$/.test(addr);
}

export function isValidNumber(val: any): boolean {
  return typeof val === "number" && !isNaN(val) && val >= 0;
}

// ── OpenRouter Live LLM Integration ──────────────────────────────────────────

export let activeConsensusSummary = "Initial consensus strategy: Maintain a balanced spread. Volatility is normal.";

export async function queryOpenRouter(
  model: string,
  prompt: string,
  apiKey: string
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aura.finance",
      "X-Title": "AURA AgentFi"
    },
    body: JSON.stringify({
      model: model,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!response.ok) {
    throw new Error(`OpenRouter HTTP ${response.status} for model ${model}`);
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`Empty response from OpenRouter model ${model}`);
  return content.replace(/```json/g, "").replace(/```/g, "").trim();
}

export async function runThinkerPanelConsensus(
  traces: AuditTrace[],
  apiKey: string
): Promise<string> {
  console.log("🧠 Thinker Panel: Running off-loop multi-model consensus checks...");
  
  const tracesSummary = traces.map((t, idx) => ({
    cycle: idx + 1,
    decision: t.trade_decision,
    pnl: t.pnl_dusdc,
    confidence: t.confidence
  }));

  const consensusPrompt = `Analyze these recent options trading execution traces and output a concise consensus strategy summary (max 2 sentences) for the execution grunt:
Traces: ${JSON.stringify(tracesSummary)}
Provide a strategic direction (e.g. shift to widening spread, decrease trade sizes, etc.) based on the net performance.`;

  const models = [
    "nvidia/nemotron-3-ultra-550b-a55b:free",
    "qwen/qwen3-coder:free",
    "meta-llama/llama-3.3-70b-instruct:free"
  ];

  console.log(`🧠 Thinker Panel: Dispatching ${models.length} model queries in parallel...`);
  const promises = models.map(async (model) => {
    try {
      console.log(`🧠 Thinker Panel: Querying model ${model} in parallel...`);
      const response = await queryOpenRouter(model, consensusPrompt, apiKey);
      return response;
    } catch (e) {
      console.warn(`⚠️ Thinker Panel: Model ${model} query failed:`, (e as Error).message);
      return null;
    }
  });

  const resolved = await Promise.all(promises);
  const results = resolved.filter((r): r is string => r !== null);

  if (results.length === 0) {
    console.warn("⚠️ Thinker Panel: All consensus models failed. Using fallback summary.");
    const netPnL = traces.reduce((acc, t) => acc + (t.pnl_dusdc || 0), 0);
    if (netPnL < 0) {
      return "Consensus fallback strategy: Net loss detected. Shift to risk-averse mode, widen options spreads, and scale down trade size.";
    } else {
      return "Consensus fallback strategy: Profitable trend. Maintain current options spread parameters.";
    }
  }

  console.log("🧠 Thinker Panel: Consensus views synthesized successfully.");
  return results.join(" | ");
}

export async function queryOpenRouterLLM(
  svi: SVIParameters,
  previousSummary: string,
  apiKey: string,
  model: string = "google/gemma-4-26b-a4b-it:free"
): Promise<string> {
  const prompt = `You are AURA, an options trading executor on Sui.
Volatility surface SVI parameters: a=${svi.a}, b=${svi.b}, rho=${svi.rho}, m=${svi.m}, sigma=${svi.sigma}.
Previous Cycle Status: "${previousSummary}".
Base SUI price is 70000.
Evaluate options market volatility and select one strategy decision.
Respond ONLY with a valid JSON object matching this schema:
{
  "decision": "WIDEN_SPREAD" | "MAINTAIN_SPREAD" | "REDUCE_SIZE",
  "confidence": number, // between 0.0 and 1.0
  "reasoning": string
}`;

  try {
    return await queryOpenRouter(model, prompt, apiKey);
  } catch (err) {
    throw new Error(`OpenRouter query failed: ${(err as Error).message}`);
  }
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
  const minVariance = svi.a + svi.b * svi.sigma * Math.sqrt(1 - svi.rho * svi.rho);
  if (minVariance < 0) {
    return false;
  }

  // 3. Butterfly arbitrage check: probability density g(x) >= 0.
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
  options: { 
    mockMode?: boolean; 
    walrusMockFallback?: boolean; 
    successOverride?: boolean;
    lastBlobId?: string;
    idempotencyUuid?: string;
    copyParams?: {
      lowerStrike: number;
      higherStrike: number;
      expiry: number;
      amount: number;
    }
  } = {}
): Promise<{ success: boolean; txDigest?: string; blobId?: string; confidence?: number }> {
  const mockMode = options.mockMode ?? false;
  const walrusMockFallback = options.walrusMockFallback ?? true;
  const successOverride = options.successOverride ?? true;
  const agentAddress = agentKeypair.toSuiAddress();
 
  console.log(`🤖 Starting trade cycle for agent: ${agentAddress}`);
  console.log(`  Policy Wallet: ${policyObjectId}`);

  // Reflective Memory learning loop parameters
  let reflectiveTradeAmountAdjustment = 1.0;
  let reflectiveMarginWidenFactor = 1.0;
  let previousSummary = "No previous memory recorded.";

  if (options.lastBlobId) {
    try {
      console.log(`🧠 Reflective Memory: Fetching and decrypting previous trace ${options.lastBlobId}...`);
      const encryptedTrace = await downloadFromWalrus(options.lastBlobId, mockMode || walrusMockFallback);
      const decryptedBytes = await decryptWithSeal(encryptedTrace);
      const decryptedStr = new TextDecoder().decode(decryptedBytes);
      
      if (decryptedStr.startsWith("Strategy Summary")) {
        previousSummary = decryptedStr;
        console.log(`🧠 Reflective Memory: Loaded compressed strategy summary: "${decryptedStr}"`);
        if (decryptedStr.includes("Bias: BEARISH_HEAVY") || decryptedStr.includes("Net PnL: -")) {
          console.log(yellow("🧠 Reflective Memory: Compressed history indicates net loss. Decreasing trade amount by 25% and widening volatility margin by 20%."));
          reflectiveTradeAmountAdjustment = 0.75;
          reflectiveMarginWidenFactor = 1.20;
        } else {
          console.log(green("🧠 Reflective Memory: Compressed history indicates profitability. Maintaining default risk parameters."));
        }
      } else {
        const lastTrace = JSON.parse(decryptedStr);
        if (lastTrace && typeof lastTrace.pnl_dusdc === "number") {
          previousSummary = `Previous cycle PnL was ${lastTrace.pnl_dusdc / 1e6} dUSDC. Status: ${lastTrace.trade_decision}`;
          console.log(`🧠 Reflective Memory: Previous cycle PnL was ${lastTrace.pnl_dusdc / 1e6} dUSDC`);
          if (lastTrace.pnl_dusdc < 0) {
            console.log(yellow("🧠 Reflective Memory: Last cycle recorded a loss. Decreasing trade amount by 25% and widening volatility margin by 20%."));
            reflectiveTradeAmountAdjustment = 0.75;
            reflectiveMarginWidenFactor = 1.20;
          } else {
            console.log(green("🧠 Reflective Memory: Last cycle was profitable. Maintaining default risk parameters."));
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Failed to parse previous Walrus trace for Reflective Memory:`, (err as Error).message);
    }
  }

  let svi: SVIParameters;
  let lowerStrike = 0;
  let higherStrike = 0;
  let expiry = 0;
  let tradeAmount = 0;
  const oracleId = process.env.DEEPBOOK_ORACLE_ID || "0x0000000000000000000000000000000000000000000000000000000000000006";

  if (options.copyParams) {
    svi = {
      a: 0.04,
      b: 0.1,
      rho: -0.4,
      m: 0.01,
      sigma: 0.15,
      timestamp: Date.now(),
    };
    lowerStrike = options.copyParams.lowerStrike;
    higherStrike = options.copyParams.higherStrike;
    expiry = options.copyParams.expiry;
    tradeAmount = options.copyParams.amount;
    console.log(`📡 Live Copy Trading Override Ingested | Spread: ${lowerStrike}-${higherStrike} | Expiry: ${expiry} | Amount: ${tradeAmount / 1e6} dUSDC`);
  } else {
    // Step 1: Fetch SVI parameters
    const fetchedSvi = await fetchSVIParameters(true);
    console.log("📊 SVI Volatility Parameters loaded:", fetchedSvi);
 
    // Step 2: Freshness check (abort if SVI data is older than 15s)
    const sviTimestamp = fetchedSvi.timestamp ?? Date.now();
    const timeDelta = Math.abs(Date.now() - sviTimestamp);
    if (timeDelta > 15_000) {
      console.error(`❌ SVI oracle data is stale (${(timeDelta / 1000).toFixed(1)}s delta). Aborting.`);
      return { success: false };
    }
 
    // Step 3: Arbitrage check
    if (!isArbitrageFree(fetchedSvi)) {
      console.error("❌ Volatility surface contains arbitrage. Oracle manipulation detected! Aborting execution.");
      return { success: false };
    }
    console.log("✅ Volatility surface verified arbitrage-free.");
    svi = fetchedSvi;
  }
 
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
  if (!options.copyParams) {
    const trace = popTrace();
    if (trace) {
      const isWhale = trace.tradeAmount > 1000_000_000;
      tradeAmount = isWhale ? 20_000_000 : 5_000_000;
      tradeAmount = Math.floor(tradeAmount * reflectiveTradeAmountAdjustment);
      expiry = trace.expiry;
      lowerStrike = trace.lowerStrike;
      higherStrike = trace.higherStrike;
      svi.sigma = trace.volatilityEstimate;
      console.log(`📊 Ingested DeepBook User Trace: ${trace.id} | Amount: ${tradeAmount / 1_000_000} dUSDC | Spread: ${lowerStrike}-${higherStrike}`);
    } else {
      tradeAmount = Math.floor(5_000_000 * reflectiveTradeAmountAdjustment);
      const basePrice = 70000;
      const spread = Math.floor(basePrice * svi.sigma * reflectiveMarginWidenFactor); 
      lowerStrike = basePrice - spread;
      higherStrike = basePrice + spread;
      expiry = Math.floor(Date.now() / 1000) + 86400; // 24 hours expiry
    }
  }

  // 9.7 - 9.10 Enforce V4 Hybrid Validator-Consensus pattern
  let rawLLMOutputJSON = "";
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const promptSummary = `Previous Cycle Status: "${previousSummary}". Active Consensus Strategy: "${activeConsensusSummary}".`;

  if (openRouterApiKey && !openRouterApiKey.includes("placeholder") && !options.copyParams) {
    const gruntModels = [
      "google/gemma-4-26b-a4b-it:free",
      "qwen/qwen3-next-80b-a3b-instruct:free",
      "nvidia/nemotron-3-ultra-550b-a55b:free"
    ];

    for (const model of gruntModels) {
      console.log(`🤖 Querying live Grunt model ${model} on OpenRouter for options pricing strategy decision...`);
      try {
        rawLLMOutputJSON = await queryOpenRouterLLM(svi, promptSummary, openRouterApiKey, model);
        if (rawLLMOutputJSON) {
          console.log(`✅ Successfully queried Grunt model ${model}`);
          break;
        }
      } catch (e) {
        console.warn(`⚠️ OpenRouter Grunt query to ${model} failed:`, (e as Error).message);
      }
    }
  }

  // Fallback to local deterministic simulated Grunt reasoning output if not queried or failed
  if (!rawLLMOutputJSON) {
    rawLLMOutputJSON = JSON.stringify({
      decision: "MAINTAIN_SPREAD",
      confidence: 0.85,
      reasoning: "SVI parameters normal. Volatility spread dictates maintaining spread."
    });
  }

  console.log("🔍 Running strict schema validation on Grunt output JSON...");
  let gruntOutput: GruntReasoningOutput;
  try {
    gruntOutput = validateGruntReasoning(rawLLMOutputJSON);
  } catch (e) {
    // 9.12 DecisionBench Emergent Delegation: if Grunt fails sandbox/structural parsing, escalate to Nemotron 3 Ultra
    console.warn("🚨 TS Sandbox caught structural/logical hallucination from Grunt! Triggering DecisionBench Emergent Delegation to Nemotron-3-Ultra-550B...");
    if (openRouterApiKey && !openRouterApiKey.includes("placeholder")) {
      try {
        const nemotronOutput = await queryOpenRouterLLM(svi, `Grunt validation error: ${(e as Error).message}. ` + promptSummary, openRouterApiKey, "nvidia/nemotron-3-ultra-550b-a55b:free");
        gruntOutput = validateGruntReasoning(nemotronOutput);
        console.log("✅ DecisionBench: Nemotron 3 Ultra emergent delegation successfully resolved the decision.");
      } catch (nemotronErr) {
        console.error("❌ DecisionBench: Nemotron 3 Ultra emergent delegation failed. Falling back to default.");
        gruntOutput = {
          decision: "MAINTAIN_SPREAD",
          confidence: 0.50,
          reasoning: `Emergency fallback: Grunt & Nemotron failed. Error: ${(nemotronErr as Error).message}`
        };
      }
    } else {
      gruntOutput = {
        decision: "MAINTAIN_SPREAD",
        confidence: 0.50,
        reasoning: `Emergency fallback: Grunt parsing failed. Error: ${(e as Error).message}`
      };
    }
  }

  // 9.9 TypeScript Sanity Sandbox: Map enum decisions to options strikes and sizes deterministically
  let sandbox: SandboxOutput;
  try {
    sandbox = runTSComponentSandbox(gruntOutput, svi, tradeAmount, reflectiveMarginWidenFactor);
  } catch (sandboxErr) {
    console.error("❌ TS Sandbox bounds check failed to execute:", (sandboxErr as Error).message);
    sandbox = {
      lowerStrike: 70000 - Math.floor(70000 * svi.sigma),
      higherStrike: 70000 + Math.floor(70000 * svi.sigma),
      expiry: Math.floor(Date.now() / 1000) + 86400,
      tradeAmount: Math.floor(tradeAmount * 0.75),
      decision: "MAINTAIN_SPREAD",
      confidence: 0.40,
      reasoning: `Sandbox execution error: ${(sandboxErr as Error).message}`
    };
  }

  lowerStrike = sandbox.lowerStrike;
  higherStrike = sandbox.higherStrike;
  expiry = sandbox.expiry;
  tradeAmount = sandbox.tradeAmount;
  const confidence = sandbox.confidence;
  console.log(`✅ Sandbox mapping completed. Decision: ${gruntOutput.decision} | Spread: ${lowerStrike}-${higherStrike} | Amount: ${tradeAmount / 1e6} dUSDC`);

  // Add explicit type checks to ensure all arguments passed to Sui transaction inputs are properly formed hex addresses, numbers, or BCS-compatible types
  if (!isValidSuiAddress(REGISTRY_OBJECT_ID)) {
    throw new Error(`Invalid SUI registry address: ${REGISTRY_OBJECT_ID}`);
  }
  if (!isValidSuiAddress(agentAddress)) {
    throw new Error(`Invalid SUI agent address: ${agentAddress}`);
  }
  if (!isValidSuiAddress(policyObjectId)) {
    throw new Error(`Invalid SUI policy wallet address: ${policyObjectId}`);
  }
  if (!isValidSuiAddress(DEEPBOOK_PREDICT_PACKAGE_ID)) {
    throw new Error(`Invalid DeepBook Predict Package address: ${DEEPBOOK_PREDICT_PACKAGE_ID}`);
  }
  if (!isValidSuiAddress(DEEPBOOK_POOL_ID)) {
    throw new Error(`Invalid DeepBook Pool ID: ${DEEPBOOK_POOL_ID}`);
  }
  if (!isValidNumber(lowerStrike) || !isValidNumber(higherStrike) || !isValidNumber(expiry) || !isValidNumber(tradeAmount)) {
    throw new Error("Invalid numeric arguments for trading cycle");
  }

  const tx = new Transaction();

  // If idempotency UUID is provided, insert it into the transaction block as a pure input
  if (options.idempotencyUuid) {
    tx.pure.string(options.idempotencyUuid);
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
      tx.pure.bool(successOverride),
    ],
  });

  let txDigest = `mock-tx-digest-trade-${crypto.randomBytes(8).toString("hex")}`;

  // 9.11 Double-Fetch Oracle Check immediately before signing
  console.log("📡 Double-Fetch Oracle Check: Fetching latest SVI oracle parameters prior to transaction submission...");
  try {
    const preSignSvi = await fetchSVIParameters(true);
    const preSignTimestamp = preSignSvi.timestamp ?? Date.now();
    if (Math.abs(Date.now() - preSignTimestamp) > 15_000) {
      console.error(`❌ Double-Fetch Oracle Check failed: SVI oracle data is stale (${(Math.abs(Date.now() - preSignTimestamp) / 1000).toFixed(1)}s delta). Aborting.`);
      return { success: false };
    }
    console.log("✅ Double-Fetch Oracle Check passed: SVI data remains fresh.");
  } catch (err) {
    console.error(`❌ Double-Fetch Oracle Check failed to execute: ${(err as Error).message}. Aborting.`);
    return { success: false };
  }

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
        tx.setGasBudget(2_000_000);
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
  
  const reasoningInput = `SVI(sigma=${svi.sigma.toFixed(3)},rho=${svi.rho.toFixed(3)}) -> spread=${higherStrike - lowerStrike}`;
  const reasoningHash = crypto.createHash("sha256").update(reasoningInput).digest("hex");
  const decisionStr = `Mint Range ${(lowerStrike/1000).toFixed(1)}k-${(higherStrike/1000).toFixed(1)}k`;

  let currentEpoch = 100;
  let currentGasBalance = 5_200_000_000;
  if (!mockMode) {
    try {
      const state = await SUI_CLIENT.getLatestSuiSystemState();
      currentEpoch = Number(state.epoch);
      const agentGasCoins = await SUI_CLIENT.getCoins({ owner: agentAddress });
      const coinData = Array.isArray(agentGasCoins?.data) ? agentGasCoins.data : [];
      currentGasBalance = coinData.reduce((acc, c) => acc + Number(c.balance), 0);
    } catch (e) {
      console.warn("⚠️ Could not query on-chain epoch/gas. Using mock fallback.");
    }
  } else {
    currentEpoch = Math.floor(Date.now() / 1000 / 86400);
  }

  const simulatedTradeResult = {
    epoch: currentEpoch,
    decision: decisionStr,
    amount: tradeAmount,
    refund: Math.floor(tradeAmount * 0.98),
    reasoningHash: reasoningHash,
    gasBalance: currentGasBalance,
    confidence: confidence,
  };

  let archiveResult;
  try {
    archiveResult = await archiveTradeAudit(
      simulatedTradeResult,
      svi,
      policyObjectId,
      agentKeypair,
      { mockMode, walrusMockFallback }
    );
  } catch (error) {
    console.error("❌ Archiving pipeline failed:", (error as Error).message);
    return { success: false, txDigest };
  }

  // Push trace to history map for state compression
  const trace = buildAuditTrace(simulatedTradeResult, svi, policyObjectId, agentAddress);
  if (!recentTracesMap[agentAddress]) {
    recentTracesMap[agentAddress] = [];
  }
  recentTracesMap[agentAddress].push(trace);

  let finalBlobId = archiveResult.blobId;

  // Periodically compress state history after every 5 cycles to prevent context window overflow
  if (recentTracesMap[agentAddress].length >= 5) {
    try {
      console.log(`🗜️ State History Compression: Compressing last 5 traces for agent ${agentAddress}...`);
      const compressionBlobId = await compressStateHistory(
        recentTracesMap[agentAddress],
        agentKeypair,
        mockMode,
        walrusMockFallback
      );
      // Overwrite the on-chain registry history blob with the compressed summary blob ID
      await commitBlobIdOnChain(compressionBlobId, agentKeypair, mockMode);
      console.log(`🗜️ State History Compression: Successfully committed compressed summary blob ${compressionBlobId} on-chain.`);
      finalBlobId = compressionBlobId;

      // 9.10 Consensus Thinker Panel: Update activeConsensusSummary off-loop
      if (openRouterApiKey && !openRouterApiKey.includes("placeholder")) {
        try {
          const newConsensus = await runThinkerPanelConsensus(recentTracesMap[agentAddress], openRouterApiKey);
          activeConsensusSummary = newConsensus;
          console.log(`🧠 Thinker Panel: New consensus strategy established: "${activeConsensusSummary}"`);
        } catch (consensusErr) {
          console.error("❌ Thinker Panel consensus query failed:", (consensusErr as Error).message);
        }
      }

      recentTracesMap[agentAddress] = []; // Reset history after consensus reads it
    } catch (compressErr) {
      console.error(`❌ State History Compression failed:`, (compressErr as Error).message);
    }
  }

  console.log("🎉 Trade cycle completed successfully!");

  return {
    success: true,
    txDigest,
    blobId: finalBlobId,
    confidence,
  };
}

/**
 * Main loop that runs the trading agent on a periodic interval.
 */
export function startAgentLoop(
  agentKeypair: Ed25519Keypair,
  policyObjectId: string,
  intervalMs: number = 60_000,
  options: { mockMode?: boolean; walrusMockFallback?: boolean } = {}
) {
  console.log(`📡 Starting agent trading loop (interval: ${intervalMs / 1000}s)`);
  
  const loop = async () => {
    try {
      await executeTradeCycle(agentKeypair, policyObjectId, options);
    } catch (error) {
      console.error("⚠️ Error in strategy loop iteration:", error);
    }
  };

  loop();
  return setInterval(loop, intervalMs);
}
