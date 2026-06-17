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

/**
 * In a full production environment, this would query Sui Mainnet indexers
 * or the Sui RPC for `MintRangeEvent` from the DeepBook Predict contracts.
 * For this testnet demonstration, we simulate fetching historical traces
 * mapped from human trading distributions (e.g. retail vs whale sizes,
 * wide vs tight strike spreads).
 */
async function fetchDeepBookTraces() {
  console.log("📡 Connecting to Sui Mainnet Indexer (Simulated)...");
  console.log("🔍 Querying historical `predict_pool::MintRangeEvent` events...");
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  const traces: DeepBookTrace[] = [];
  const now = Date.now();
  const basePrice = 70000;
  
  // Generate 500 realistic historical human trades
  for (let i = 0; i < 500; i++) {
    const isWhale = Math.random() > 0.85;
    const isDegen = Math.random() > 0.70;
    
    // Trade Amount: retail 10-100, whale 1000-50000
    const tradeAmount = isWhale 
      ? Math.floor(Math.random() * 49000 + 1000) * 1_000_000 
      : Math.floor(Math.random() * 90 + 10) * 1_000_000;
      
    // Expiry: 1 day or 7 days
    const expiry = isDegen ? (now + 86400 * 1000) : (now + 7 * 86400 * 1000);
    
    // Volatility estimate: between 5% and 25%
    const impliedVol = 0.05 + Math.random() * 0.20;
    
    // Spread: degens take tight spreads, whales take wide safe spreads
    const spreadMultiplier = isDegen ? 0.5 : (isWhale ? 1.5 : 1.0);
    const spread = Math.floor(basePrice * impliedVol * spreadMultiplier);
    
    // Slight human bias (not perfectly centered)
    const bias = (Math.random() - 0.5) * 1000;
    
    traces.push({
      id: `trace-tx-${Math.random().toString(36).substring(2, 10)}`,
      timestampMs: now - Math.floor(Math.random() * 30 * 86400 * 1000), // Random time in last 30 days
      tradeAmount,
      lowerStrike: Math.floor(basePrice - spread + bias),
      higherStrike: Math.floor(basePrice + spread + bias),
      expiry: Math.floor(expiry / 1000),
      action: "MintRange",
      volatilityEstimate: impliedVol
    });
  }
  
  // Sort chronologically (oldest first)
  traces.sort((a, b) => a.timestampMs - b.timestampMs);
  
  const outPath = path.join(__dirname, "deepbook_traces.json");
  fs.writeFileSync(outPath, JSON.stringify(traces, null, 2));
  
  console.log(`✅ Successfully fetched and mapped ${traces.length} historical DeepBook traces.`);
  console.log(`💾 Saved to ${outPath}`);
}

fetchDeepBookTraces().catch(console.error);
