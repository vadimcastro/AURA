import { MemWalClient } from "../memwal_client.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM __dirname resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let testCount = 0;
let passedCount = 0;

function assert(condition: boolean, message: string) {
  testCount++;
  if (!condition) {
    console.error(`❌ MemWal Test #${testCount} FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
  console.log(`✅ MemWal Test #${testCount} PASSED: ${message}`);
}

async function runMemWalTests() {
  console.log("🧪 Running MemWalClient Unit & Simulation Tests...");

  const testCacheDir = path.resolve(__dirname, "./.memwal_test_cache");

  // Cleanup prior test run cache if exists
  if (fs.existsSync(testCacheDir)) {
    fs.rmSync(testCacheDir, { recursive: true, force: true });
  }

  // 1. Instantiation with empty token triggers Simulation Mode
  const mockClient = new MemWalClient({
    apiUrl: "http://example.com/memwal",
    token: "placeholder_token",
    backupDir: testCacheDir,
  });

  assert(mockClient.inSimulationMode() === true, "MemWalClient should be in simulation mode when token has placeholder");

  // 2. Write session data in simulation mode
  const testKey = "session-123";
  const testPayload = {
    agent: "0xabc",
    action: "Mint Range",
    params: { lower: 68000, upper: 72000 },
    timestamp: new Date().toISOString(),
  };

  const writeResult = await mockClient.writeSessionData(testKey, testPayload);
  assert(writeResult === true, "writeSessionData should succeed in simulation mode");

  // 3. Verify cached file was written to disk
  const cachedFilePath = path.join(testCacheDir, `${testKey}.json`);
  assert(fs.existsSync(cachedFilePath) === true, "A backup file should be written to the local cache directory");

  const diskContent = JSON.parse(fs.readFileSync(cachedFilePath, "utf8"));
  assert(diskContent.agent === "0xabc", "Cached content on disk must match the payload structure");

  // 4. Read session data in simulation mode
  const readResult = await mockClient.readSessionData(testKey);
  assert(readResult !== null, "readSessionData should return non-null for an existing key");
  assert(readResult.action === "Mint Range", "Retrieved payload must match original data fields");

  // 5. Read non-existent key returns null
  const missingResult = await mockClient.readSessionData("key-does-not-exist");
  assert(missingResult === null, "Reading a missing key must return null");

  // 6. Network failure fallback (using an invalid URL and a real token format to trigger live mode)
  const fallbackClient = new MemWalClient({
    apiUrl: "http://invalid-url-that-does-not-exist.mystenlabs.com",
    token: "real_token_format",
    backupDir: testCacheDir,
  });

  assert(fallbackClient.inSimulationMode() === false, "MemWalClient should be in live mode when a real token format is supplied");

  // Write through live client should hit network exception but fallback to cache and return true
  const fallbackKey = "fallback-session";
  const fallbackPayload = { data: "secured_telemetry" };

  const fallbackWriteResult = await fallbackClient.writeSessionData(fallbackKey, fallbackPayload);
  assert(fallbackWriteResult === true, "writeSessionData should fall back to cache and return true on network failure");
  assert(fs.existsSync(path.join(testCacheDir, `${fallbackKey}.json`)) === true, "Fallback client should successfully save to disk cache");

  // Cleanup test cache directory
  if (fs.existsSync(testCacheDir)) {
    fs.rmSync(testCacheDir, { recursive: true, force: true });
  }

  console.log(`\n🎉 MemWalClient tests complete: ${passedCount}/${testCount} assertions passed.\n`);
}

runMemWalTests().catch((e) => {
  console.error("❌ MemWal tests failed:", e);
  process.exit(1);
});
