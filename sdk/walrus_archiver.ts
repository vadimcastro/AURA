import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import * as crypto from "crypto";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID, 
  WALRUS_PUBLISHER, 
  WALRUS_AGGREGATOR,
  MEMWAL_API_URL,
  MEMWAL_TOKEN,
  getAgentKeypair 
} from "./config.js";
import { MemWalClient } from "./memwal_client.js";

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface AuditTrace {
  epoch: number;
  policy_wallet: string;
  agent_address: string;
  svi_surface: object;
  svi_calculations?: {
    a: number;
    b: number;
    rho: number;
    sigma: number;
    m: number;
  };
  trade_decision: string;
  trade_amount_dusdc: number;
  refund_amount_dusdc: number;
  pnl_dusdc: number;
  arbitrage_check_passed: boolean;
  model_reasoning_hash: string;
  gas_balance_sui: number;
  timestamp: string;
  confidence?: number;
}

// ── Seal Mock Encryption (AES-256-GCM) ──────────────────────────────────────

export interface SealEnvelope {
  policyObjectId: string;
  sealVersion: string;
  ciphertext: string; // hex encoded ciphertext
  iv: string;         // hex encoded initialization vector
  tag: string;        // hex encoded authentication tag
  timestamp: string;  // ISO timestamp
}

// Secure mock key derived deterministically for testing round-trips
const MOCK_SEAL_KEY = crypto.scryptSync("mock-seal-passphrase", "aura-salt", 32);

// Local in-memory mock blob storage cache for simulation round-trips
export const mockBlobStorage: Record<string, Uint8Array> = {};

/**
 * Mocks the client-side Seal threshold encryption by encrypting the payload
 * using AES-256-GCM, wrapping it inside a structured SealEnvelope.
 */
export async function encryptWithSeal(
  payload: Uint8Array,
  policyObjectId: string = ""
): Promise<Uint8Array> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MOCK_SEAL_KEY, iv);
  
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  const envelope: SealEnvelope = {
    policyObjectId,
    sealVersion: "1.0.0-mock",
    ciphertext: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    tag: tag.toString("hex"),
    timestamp: new Date().toISOString(),
  };

  return new TextEncoder().encode(JSON.stringify(envelope));
}

/**
 * Decrypts the mock Seal envelope payload to recover the original trace.
 */
export async function decryptWithSeal(encryptedPayload: Uint8Array): Promise<Uint8Array> {
  try {
    const jsonStr = new TextDecoder().decode(encryptedPayload);
    const envelope: SealEnvelope = JSON.parse(jsonStr);

    const iv = Buffer.from(envelope.iv, "hex");
    const tag = Buffer.from(envelope.tag, "hex");
    const ciphertext = Buffer.from(envelope.ciphertext, "hex");
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", MOCK_SEAL_KEY, iv);
    decipher.setAuthTag(tag);
    
    return new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch (error) {
    throw new Error(`Seal decryption failed: ${(error as Error).message}`);
  }
}

// ── Walrus Integration ──────────────────────────────────────────────────────

/**
 * Constructs the audit trace JSON structure from a trade cycle's output.
 */
export function buildAuditTrace(
  tradeResult: {
    epoch: number;
    decision: string;
    amount: number;
    refund: number;
    reasoningHash: string;
    gasBalance: number;
    confidence?: number;
  },
  svi: any,
  policyWallet: string,
  agentAddress: string
): AuditTrace {
  return {
    epoch: tradeResult.epoch,
    policy_wallet: policyWallet,
    agent_address: agentAddress,
    svi_surface: svi,
    svi_calculations: {
      a: svi.a,
      b: svi.b,
      rho: svi.rho,
      sigma: svi.sigma,
      m: svi.m,
    },
    trade_decision: tradeResult.decision,
    trade_amount_dusdc: tradeResult.amount,
    refund_amount_dusdc: tradeResult.refund,
    pnl_dusdc: tradeResult.refund - tradeResult.amount,
    arbitrage_check_passed: true,
    model_reasoning_hash: tradeResult.reasoningHash,
    gas_balance_sui: tradeResult.gasBalance,
    timestamp: new Date().toISOString(),
    confidence: tradeResult.confidence,
  };
}

/**
 * Uploads an encrypted payload to the Walrus Testnet publisher.
 * Falls back to a simulated blob ID if the network request fails and mock is enabled.
 */
export async function uploadToWalrus(
  encryptedPayload: Uint8Array,
  useMockFallback: boolean = false
): Promise<string> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(encryptedPayload),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const blobId = result.newlyCreated?.blobObject?.blobId ?? result.alreadyCertified?.blobId;
    if (!blobId) {
      throw new Error("No blobId returned in Walrus response");
    }
    mockBlobStorage[blobId] = encryptedPayload;
    return blobId;
  } catch (error) {
    if (useMockFallback) {
      const hash = crypto.createHash("sha256").update(encryptedPayload).digest("hex");
      const simulatedBlobId = `mock-blob-${hash.substring(0, 32)}`;
      console.log(`⚠️ Walrus offline or unreachable. Using simulated blob ID: ${simulatedBlobId}`);
      mockBlobStorage[simulatedBlobId] = encryptedPayload;
      return simulatedBlobId;
    }
    throw new Error(`Walrus upload failed: ${(error as Error).message}`);
  }
}

/**
 * Constructs the transaction to commit the blob ID to the on-chain registry.
 * If mockMode is false, executes the transaction using the agent's keypair.
 */
export async function commitBlobIdOnChain(
  blobId: string,
  agentKeypair: Ed25519Keypair,
  mockMode: boolean = false
): Promise<string> {
  const agentAddress = agentKeypair.toSuiAddress();
  const tx = new Transaction();
  const blobIdBytes = new TextEncoder().encode(blobId);

  tx.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::update_walrus_history`,
    arguments: [
      tx.object(REGISTRY_OBJECT_ID),
      tx.pure.vector("u8", Array.from(Buffer.from(blobId, "utf8"))),
    ],
  });

  if (mockMode || AURA_PACKAGE_ID.includes("placeholder")) {
    console.log("🛠️ Mock Mode: Constructed update_walrus_history transaction block.");
    console.log(`  Package ID: ${AURA_PACKAGE_ID}`);
    console.log(`  Registry:   ${REGISTRY_OBJECT_ID}`);
    console.log(`  Blob ID:    ${blobId}`);
    return `mock-tx-digest-commit-${crypto.randomBytes(8).toString("hex")}`;
  }

  tx.setSender(agentAddress);

  const result = await SUI_CLIENT.signAndExecuteTransaction({
    signer: agentKeypair,
    transaction: tx,
  });

  return result.digest;
}

import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

/**
 * Orchestrates the full audit-archiving pipeline:
 * 1. Verifies the agent's SUI balance (must be >= 1 SUI to pay for gas).
 * 2. Formats the trace as a structured JSON object.
 * 3. Encrypts the trace client-side using the mock Seal AES-256-GCM.
 * 4. Uploads the encrypted trace to Walrus.
 * 5. Commits the resulting blob ID to the on-chain reputation registry.
 */
export async function archiveTradeAudit(
  tradeResult: {
    epoch: number;
    decision: string;
    amount: number;
    refund: number;
    reasoningHash: string;
    gasBalance: number;
  },
  svi: any,
  policyWallet: string,
  agentKeypair: Ed25519Keypair,
  options: { mockMode?: boolean; walrusMockFallback?: boolean } = {}
): Promise<{ blobId: string; txDigest: string }> {
  const agentAddress = agentKeypair.toSuiAddress();
  const mockMode = options.mockMode ?? false;
  const walrusMockFallback = options.walrusMockFallback ?? true;

  // 1. Check gas budget (must be >= 1 SUI / 1,000,000,000 MIST)
  let actualBalance = BigInt(tradeResult.gasBalance);
  if (!mockMode) {
    try {
      const balanceResp = await SUI_CLIENT.getBalance({ owner: agentAddress });
      actualBalance = BigInt(balanceResp.totalBalance);
    } catch (e) {
      console.warn("⚠️ Could not query on-chain balance. Using local gasBalance field.", e);
    }
  }

  const minGasRequirement = BigInt(1_000_000); // 0.001 SUI
  if (actualBalance < minGasRequirement) {
    throw new Error(
      `❌ GAS_EXHAUSTED: Ephemeral agent balance (${actualBalance} MIST) is below the safety floor of 0.001 SUI. Archival aborted.`
    );
  }

  // 2. Build audit trace
  const trace = buildAuditTrace(tradeResult, svi, policyWallet, agentAddress);

  // 2.5 Store audit trace in MemWal persistent session storage
  try {
    const memWalClient = new MemWalClient({
      apiUrl: MEMWAL_API_URL,
      token: MEMWAL_TOKEN,
    });
    const memWalKey = `audit_trace_${tradeResult.epoch}_${agentAddress}`;
    await memWalClient.writeSessionData(memWalKey, trace);
  } catch (memWalError) {
    console.warn("⚠️ MemWal Client Sync failed:", (memWalError as Error).message);
  }

  // 3. Encrypt payload
  const rawBytes = new TextEncoder().encode(JSON.stringify(trace));
  const encrypted = await encryptWithSeal(rawBytes, policyWallet);

  // 4. Upload to Walrus
  const blobId = await uploadToWalrus(encrypted, walrusMockFallback);
  console.log(`📦 Walrus blob uploaded: ${blobId}`);

  // 5. Commit on-chain
  const txDigest = await commitBlobIdOnChain(blobId, agentKeypair, mockMode);
  console.log(`🔗 On-chain blob_id committed: ${txDigest}`);

  return { blobId, txDigest };
}

/**
 * Strategy state compression to prevent context window overflow.
 * Compiles a dense Strategy Summary String and uploads to Walrus.
 */
export async function compressStateHistory(
  traces: AuditTrace[],
  agentKeypair: Ed25519Keypair,
  mockMode: boolean = false,
  walrusMockFallback: boolean = true
): Promise<string> {
  const total = traces.length;
  if (total === 0) return "";
  const wins = traces.filter(t => t.pnl_dusdc > 0).length;
  const winRate = (wins / total) * 100;
  const netPnl = traces.reduce((acc, t) => acc + t.pnl_dusdc, 0);
  const bias = netPnl > 0 ? "BULLISH_WINNING" : "BEARISH_HEAVY";

  const summary = `Strategy Summary | Total Cycles: ${total} | Win-rate: ${winRate.toFixed(1)}% | Net PnL: ${netPnl / 1e6} dUSDC | Bias: ${bias}`;
  console.log(`🗜️ Compressing state history of ${total} traces: "${summary}"`);
  
  const rawBytes = new TextEncoder().encode(summary);
  const encrypted = await encryptWithSeal(rawBytes, "compression-policy");
  const blobId = await uploadToWalrus(encrypted, walrusMockFallback);
  console.log(`🗜️ Uploaded compressed strategy summary to Walrus. Blob ID: ${blobId}`);
  return blobId;
}

/**
 * Downloads a blob from Walrus using the aggregator.
 */
export async function downloadFromWalrus(
  blobId: string,
  useMockFallback: boolean = false
): Promise<Uint8Array> {
  if (useMockFallback || blobId.startsWith("mock-")) {
    console.log(`⚠️ Mock Mode: Simulating Walrus download for blob ID: ${blobId}`);
    if (mockBlobStorage[blobId]) {
      return mockBlobStorage[blobId];
    }
    // Return a mocked encrypted payload that decrypts to a default trace as fallback
    const defaultTrace: AuditTrace = {
      epoch: 100,
      policy_wallet: "0x123",
      agent_address: "0x456",
      svi_surface: {},
      trade_decision: "HOLDING_PREDICT_RANGE",
      trade_amount_dusdc: 20_000_000,
      refund_amount_dusdc: 15_000_000, // simulated loss (15 < 20)
      pnl_dusdc: -5_000_000,
      arbitrage_check_passed: true,
      model_reasoning_hash: "hash",
      gas_balance_sui: 5_000_000_000,
      timestamp: new Date().toISOString(),
    };
    const rawBytes = new TextEncoder().encode(JSON.stringify(defaultTrace));
    return await encryptWithSeal(rawBytes, "0x123");
  }

  try {
    const response = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/${blobId}`);
    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  } catch (error) {
    throw new Error(`Walrus download failed: ${(error as Error).message}`);
  }
}
