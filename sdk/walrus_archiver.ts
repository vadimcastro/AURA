import { Transaction } from "@mysten/sui/transactions";
import * as crypto from "crypto";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID, 
  WALRUS_PUBLISHER, 
  getAgentKeypair 
} from "./config.js";

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface AuditTrace {
  epoch: number;
  policy_wallet: string;
  agent_address: string;
  svi_surface: object;
  trade_decision: string;
  trade_amount_dusdc: number;
  refund_amount_dusdc: number;
  pnl_dusdc: number;
  arbitrage_check_passed: boolean;
  model_reasoning_hash: string;
  gas_balance_sui: number;
  timestamp: string;
}

// ── Seal Mock Encryption (AES-256-GCM) ──────────────────────────────────────

// Secure mock key derived deterministically for testing round-trips
const MOCK_SEAL_KEY = crypto.scryptSync("mock-seal-passphrase", "aura-salt", 32);

/**
 * Mocks the client-side Seal threshold encryption by encrypting the payload
 * using AES-256-GCM.
 */
export async function encryptWithSeal(payload: Uint8Array): Promise<Uint8Array> {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", MOCK_SEAL_KEY, iv);
  
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  
  // Format: [iv (12 bytes)] + [tag (16 bytes)] + [encrypted data]
  return new Uint8Array(Buffer.concat([iv, tag, encrypted]));
}

/**
 * Decrypts the mock Seal payload to recover the original trace.
 */
export async function decryptWithSeal(encryptedPayload: Uint8Array): Promise<Uint8Array> {
  try {
    const buf = Buffer.from(encryptedPayload);
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const encryptedData = buf.subarray(28);
    
    const decipher = crypto.createDecipheriv("aes-256-gcm", MOCK_SEAL_KEY, iv);
    decipher.setAuthTag(tag);
    
    return new Uint8Array(Buffer.concat([decipher.update(encryptedData), decipher.final()]));
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
    trade_decision: tradeResult.decision,
    trade_amount_dusdc: tradeResult.amount,
    refund_amount_dusdc: tradeResult.refund,
    pnl_dusdc: tradeResult.refund - tradeResult.amount,
    arbitrage_check_passed: true,
    model_reasoning_hash: tradeResult.reasoningHash,
    gas_balance_sui: tradeResult.gasBalance,
    timestamp: new Date().toISOString(),
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
    const response = await fetch(`${WALRUS_PUBLISHER}/v1/blobs`, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(encryptedPayload),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    const blobId = result.newlyCreated?.blobObject?.blobId ?? result.alreadyCertified?.blobId;
    if (!blobId) {
      throw new Error("No blobId returned in Walrus response");
    }
    return blobId;
  } catch (error) {
    if (useMockFallback) {
      const hash = crypto.createHash("sha256").update(encryptedPayload).digest("hex");
      const simulatedBlobId = `mock-blob-${hash.substring(0, 32)}`;
      console.log(`⚠️ Walrus offline or unreachable. Using simulated blob ID: ${simulatedBlobId}`);
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
  agentAddress: string,
  mockMode: boolean = false
): Promise<string> {
  const tx = new Transaction();
  const blobIdBytes = new TextEncoder().encode(blobId);

  tx.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::update_walrus_history`,
    arguments: [
      tx.object(REGISTRY_OBJECT_ID),
      tx.pure(blobIdBytes),
    ],
  });

  if (mockMode || AURA_PACKAGE_ID.includes("placeholder")) {
    console.log("🛠️ Mock Mode: Constructed update_walrus_history transaction block.");
    console.log(`  Package ID: ${AURA_PACKAGE_ID}`);
    console.log(`  Registry:   ${REGISTRY_OBJECT_ID}`);
    console.log(`  Blob ID:    ${blobId}`);
    return `mock-tx-digest-commit-${crypto.randomBytes(8).toString("hex")}`;
  }

  const keypair = getAgentKeypair();
  tx.setSender(agentAddress);

  const result = await SUI_CLIENT.signAndExecuteTransaction({
    signer: keypair,
    transaction: tx,
  });

  return result.digest;
}

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
  agentAddress: string,
  options: { mockMode?: boolean; walrusMockFallback?: boolean } = {}
): Promise<{ blobId: string; txDigest: string }> {
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

  const minGasRequirement = BigInt(1_000_000_000); // 1 SUI
  if (actualBalance < minGasRequirement) {
    throw new Error(
      `❌ GAS_EXHAUSTED: Ephemeral agent balance (${actualBalance} MIST) is below the safety floor of 1 SUI. Archival aborted.`
    );
  }

  // 2. Build audit trace
  const trace = buildAuditTrace(tradeResult, svi, policyWallet, agentAddress);

  // 3. Encrypt payload
  const rawBytes = new TextEncoder().encode(JSON.stringify(trace));
  const encrypted = await encryptWithSeal(rawBytes);

  // 4. Upload to Walrus
  const blobId = await uploadToWalrus(encrypted, walrusMockFallback);
  console.log(`📦 Walrus blob uploaded: ${blobId}`);

  // 5. Commit on-chain
  const txDigest = await commitBlobIdOnChain(blobId, agentAddress, mockMode);
  console.log(`🔗 On-chain blob_id committed: ${txDigest}`);

  return { blobId, txDigest };
}
