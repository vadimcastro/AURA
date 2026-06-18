import { isArbitrageFree, executeTradeCycle } from "../predict_agent.js";
import { 
  encryptWithSeal, 
  decryptWithSeal, 
  buildAuditTrace, 
  uploadToWalrus,
  SealEnvelope
} from "../walrus_archiver.js";
import { MemWalClient } from "../memwal_client.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

// ── Assertion Utility ───────────────────────────────────────────────────────

let testCount = 0;
let passedCount = 0;

function assert(condition: boolean, message: string) {
  testCount++;
  if (!condition) {
    console.error(`❌ Test #${testCount} FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
  console.log(`✅ Test #${testCount} PASSED: ${message}`);
}

// ── Test Suites ─────────────────────────────────────────────────────────────

async function testArbitrageChecker() {
  console.log("\n🧪 Running Arbitrage Checker Unit Tests...");

  // 1. Valid SVI Surface
  assert(
    isArbitrageFree({ a: 0.04, b: 0.1, rho: -0.4, m: 0.01, sigma: 0.15 }),
    "Valid SVI parameters should pass arbitrage checks"
  );

  // 2. Invalid Sigma (sigma <= 0)
  assert(
    !isArbitrageFree({ a: 0.04, b: 0.1, rho: -0.4, m: 0.01, sigma: 0 }),
    "Surface with sigma <= 0 should fail"
  );

  // 3. Invalid Rho (rho >= 1)
  assert(
    !isArbitrageFree({ a: 0.04, b: 0.1, rho: 1.0, m: 0.01, sigma: 0.15 }),
    "Surface with |rho| >= 1 should fail"
  );

  // 4. Invalid b (b < 0)
  assert(
    !isArbitrageFree({ a: 0.04, b: -0.1, rho: -0.4, m: 0.01, sigma: 0.15 }),
    "Surface with negative b coefficient should fail"
  );

  // 5. Non-negativity violation (a + b*sigma*sqrt(1-rho^2) < 0)
  assert(
    !isArbitrageFree({ a: -0.05, b: 0.1, rho: 0.0, m: 0.01, sigma: 0.1 }),
    "Surface with negative minimum variance should fail"
  );

  // 6. Butterfly arbitrage limit (b * (1 + |rho|) >= 2)
  assert(
    !isArbitrageFree({ a: 0.04, b: 1.5, rho: 0.5, m: 0.01, sigma: 0.15 }),
    "Surface exceeding asymptotic butterfly limits should fail"
  );
}

async function testSealEncryption() {
  console.log("\n🧪 Running Seal Encryption Mock Unit Tests...");

  const originalText = "AURA secure telemetries audit log payload — Top Secret";
  const payload = new TextEncoder().encode(originalText);
  const mockPolicyId = "0x0000000000000000000000000000000000000000000000000000000000000003";

  // Encrypt
  const encrypted = await encryptWithSeal(payload, mockPolicyId);
  assert(encrypted.length > payload.length, "Encrypted payload should have envelope metadata overhead");

  // Verify structured SealEnvelope properties
  const jsonStr = new TextDecoder().decode(encrypted);
  let parsedEnvelope: SealEnvelope | null = null;
  try {
    parsedEnvelope = JSON.parse(jsonStr);
  } catch (e) {
    // Fail test
  }
  assert(parsedEnvelope !== null, "Encrypted payload must be a valid JSON-encoded SealEnvelope");
  assert(parsedEnvelope?.policyObjectId === mockPolicyId, "Envelope policy ID must match the parameter passed");
  assert(parsedEnvelope?.sealVersion === "1.0.0-mock", "Envelope version should be set correctly");
  assert(typeof parsedEnvelope?.ciphertext === "string" && parsedEnvelope.ciphertext.length > 0, "Ciphertext must be non-empty hex string");
  assert(typeof parsedEnvelope?.iv === "string" && parsedEnvelope.iv.length === 24, "IV must be 24-character hex string (12 bytes)");
  assert(typeof parsedEnvelope?.tag === "string" && parsedEnvelope.tag.length === 32, "Tag must be 32-character hex string (16 bytes)");

  // Decrypt
  const decrypted = await decryptWithSeal(encrypted);
  const decryptedText = new TextDecoder().decode(decrypted);
  assert(decryptedText === originalText, "Decrypted text must match the original text losslessly");

  // Authentication validation (corrupting encrypted payload's ciphertext)
  const envelopeObj = JSON.parse(jsonStr);
  const corruptedCipher = envelopeObj.ciphertext.substring(0, envelopeObj.ciphertext.length - 2) + "00";
  const corruptedEnvelope = { ...envelopeObj, ciphertext: corruptedCipher };
  const corruptedPayload = new TextEncoder().encode(JSON.stringify(corruptedEnvelope));
  
  let threwError = false;
  try {
    await decryptWithSeal(corruptedPayload);
  } catch (error) {
    threwError = true;
  }
  assert(threwError, "Decrypting corrupted cipher bytes must throw authentication tag error");
}

async function testAuditTraceFormatting() {
  console.log("\n🧪 Running Audit Trace Formatting Tests...");

  const tradeResult = {
    epoch: 120,
    decision: "Mint Range 68k-72k",
    amount: 100_000_000,
    refund: 98_000_000,
    reasoningHash: "hash-0x-abcdef",
    gasBalance: 5_000_000_000,
  };
  const svi = { a: 0.04, b: 0.1, rho: -0.4, m: 0.01, sigma: 0.15 };
  const policyWallet = "0x0000000000000000000000000000000000000000000000000000000000000003";
  const agentAddress = "0x000000000000000000000000000000000000000000000000000000000000000a";

  const trace = buildAuditTrace(tradeResult, svi, policyWallet, agentAddress);

  assert(trace.epoch === 120, "Epoch must match");
  assert(trace.policy_wallet === policyWallet, "Policy wallet address must match");
  assert(trace.agent_address === agentAddress, "Agent address must match");
  assert(trace.trade_amount_dusdc === 100_000_000, "Trade amount must match");
  assert(trace.refund_amount_dusdc === 98_000_000, "Refund amount must match");
  assert(trace.pnl_dusdc === -2_000_000, "PnL should be correctly computed as refund - amount");
  assert(trace.arbitrage_check_passed === true, "Arbitrage status flag should be true");
  assert(trace.model_reasoning_hash === "hash-0x-abcdef", "Reasoning hash must match");
  assert(trace.gas_balance_sui === 5_000_000_000, "Gas balance must match");
  assert(typeof trace.timestamp === "string" && trace.timestamp.endsWith("Z"), "Timestamp must be ISO string");
}

async function testWalrusUploadMock() {
  console.log("\n🧪 Running Walrus Upload Mock Tests...");

  const testBytes = new TextEncoder().encode("walrus blob upload testing payload");
  const blobId = await uploadToWalrus(testBytes, true);
  console.log(`  Returned Blob ID: ${blobId}`);

  assert(typeof blobId === "string", "Blob ID must be a string");
  assert(
    blobId.startsWith("mock-blob-") || blobId.length > 0, 
    "Blob ID must be either simulated or a valid real Walrus blob ID"
  );
}

async function testExecuteTradeCycleMock() {
  console.log("\n🧪 Running Strategy Loop Mock Cycle Tests...");

  const agentKeypair = new Ed25519Keypair();
  const policyObjectId = "0x0000000000000000000000000000000000000000000000000000000000000003";

  const result = await executeTradeCycle(agentKeypair, policyObjectId, {
    mockMode: true,
    walrusMockFallback: true,
  });

  assert(result.success === true, "Mock trade cycle execution should succeed");
  assert(typeof result.txDigest === "string" && result.txDigest.startsWith("mock-tx-"), "Should return mock tx digest");
  assert(
    typeof result.blobId === "string" && (result.blobId.startsWith("mock-blob-") || result.blobId.length > 0), 
    "Should return either a mock or real uploaded blob ID"
  );
}

async function testEndToEndIntegration() {
  console.log("\n🧪 Running End-to-End Integrated Simulation Test...");

  const agentKeypair = new Ed25519Keypair();
  const agentAddress = agentKeypair.toSuiAddress();
  const policyObjectId = "0x0000000000000000000000000000000000000000000000000000000000000003";

  // Run full trade cycle in mock mode
  const result = await executeTradeCycle(agentKeypair, policyObjectId, {
    mockMode: true,
    walrusMockFallback: true,
  });

  assert(result.success === true, "Integrated trade cycle execution should succeed");
  assert(typeof result.txDigest === "string", "Trade cycle must return transaction digest");
  assert(typeof result.blobId === "string" && result.blobId.length > 0, "Trade cycle must return uploaded Walrus blob ID");

  // Query local simulated MemWal cache to verify sync happened correctly
  const memWalClient = new MemWalClient();
  const expectedEpoch = Math.floor(Date.now() / 1000 / 86400);
  const memWalKey = `audit_trace_${expectedEpoch}_${agentAddress}`;
  const storedTrace = await memWalClient.readSessionData(memWalKey);

  assert(storedTrace !== null, "Audit trace must be saved and readable in MemWal database");
  assert(storedTrace.agent_address === agentAddress, "Telemetry trace agent address must match");
  assert(storedTrace.policy_wallet === policyObjectId, "Telemetry trace policy wallet ID must match");
  assert(storedTrace.trade_decision.startsWith("Mint Range"), "Telemetry trace trade decision must start with 'Mint Range'");
  assert(storedTrace.arbitrage_check_passed === true, "Telemetry trace arbitrage validation status must be true");

  console.log("  Successfully verified local MemWal telemetry database record.");
}

// ── Main Runner ─────────────────────────────────────────────────────────────

async function runAllTests() {
  console.log("🚀 Starting AURA TypeScript SDK Test Suite...");
  const startTime = Date.now();

  try {
    await testArbitrageChecker();
    await testSealEncryption();
    await testAuditTraceFormatting();
    await testWalrusUploadMock();
    await testExecuteTradeCycleMock();
    await testEndToEndIntegration();

    const duration = Date.now() - startTime;
    console.log(`\n🎉 ALL TESTS PASSED! (${passedCount}/${testCount} assertions in ${duration}ms)\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ TEST RUNNER FAILED: ${(error as Error).message}\n`);
    process.exit(1);
  }
}

runAllTests();
