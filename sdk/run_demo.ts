import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID, 
  REGISTRY_OBJECT_ID, 
  DEEPBOOK_PREDICT_PACKAGE_ID,
  DEEPBOOK_POOL_ID,
  DUSDC_TYPE_TAG,
  getAgentKeypair 
} from "./config.js";
import { executeTradeCycle } from "./predict_agent.js";
import * as crypto from "crypto";

// ── Colors Helper ────────────────────────────────────────────────────────────
const green = (text: string) => `\x1b[32m${text}\x1b[0m`;
const red = (text: string) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text: string) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text: string) => `\x1b[36m${text}\x1b[0m`;
const magenta = (text: string) => `\x1b[35m${text}\x1b[0m`;

// ── Delay & Polling Helpers ──────────────────────────────────────────────────
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pollForGasCoins(address: string, minCoins: number = 1, maxAttempts: number = 12): Promise<any[]> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const coins = await SUI_CLIENT.getCoins({ owner: address });
      if (coins.data.length >= minCoins) {
        return coins.data;
      }
    } catch (e) {
      // ignore and retry
    }
    console.log(yellow(`   Waiting for SUI gas coins to be indexed for ${address}... (attempt ${i + 1}/${maxAttempts})`));
    await sleep(2000);
  }
  throw new Error(`Timeout: No valid SUI gas coins found for address ${address}`);
}

// ── Move VM Abort Assertion Helper ──────────────────────────────────────────
async function assertTxReverts(
  tx: Transaction, 
  sender: string, 
  expectedAbortCode: number, 
  message: string
) {
  tx.setSender(sender);
  let errorStr = "";
  try {
    const txBytes = await tx.build({ client: SUI_CLIENT });
    const dryRun = await SUI_CLIENT.dryRunTransactionBlock({ transactionBlock: txBytes });
    if (dryRun.effects.status.status === "success") {
      throw new Error(`Expected transaction to revert but it succeeded. Details: ${message}`);
    }
    errorStr = dryRun.effects.status.error || "";
  } catch (error) {
    errorStr = (error as Error).message + "\n" + JSON.stringify(error);
  }
  
  const match = errorStr.match(/MoveAbort\(.*?,?\s*(\d+)\)/);
  if (!match) {
    throw new Error(`Expected Move abort error but got: "${errorStr}". Details: ${message}`);
  }
  
  const abortCode = parseInt(match[1], 10);
  if (abortCode !== expectedAbortCode) {
    throw new Error(`Expected abort code ${expectedAbortCode} but got ${abortCode}. Details: ${message}`);
  }
  
  console.log(green(`  ✓ Passed: ${message} (reverted with expected code ${expectedAbortCode})`));
}

// ── Main Demo Execution ──────────────────────────────────────────────────────
async function main() {
  console.log(cyan("===================================================================="));
  console.log(cyan("        AURA Protocol On-Chain End-to-End Demo & Verification        "));
  console.log(cyan("====================================================================\n"));

  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  console.log(cyan(`👤 Owner/Agent Address (from .env):  ${ownerAddress}`));

  // 0. Locate Owner's dUSDC Coin
  console.log(yellow("1. Fetching owner dUSDC coins on-chain..."));
  const ownerCoins = await SUI_CLIENT.getCoins({
    owner: ownerAddress,
    coinType: DUSDC_TYPE_TAG
  });
  if (ownerCoins.data.length === 0) {
    throw new Error(`Owner address ${ownerAddress} does not have any dUSDC coins. Run faucet first!`);
  }
  const dusdcCoinId = ownerCoins.data[0].coinObjectId;
  console.log(green(`   Found dUSDC Coin Object ID: ${dusdcCoinId}`));

  // 3. Create dynamic WalletPolicy
  console.log(yellow("\n3. Creating dynamic WalletPolicy on-chain..."));
  const txCreatePolicy = new Transaction();
  txCreatePolicy.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::create_policy`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txCreatePolicy.pure.address(ownerAddress),
      txCreatePolicy.pure.u64(1_000_000_000), // 1000 dUSDC limit
      txCreatePolicy.pure.vector("address", [DEEPBOOK_PREDICT_PACKAGE_ID]),
      txCreatePolicy.pure.u64(10000), // Expiration epoch
      txCreatePolicy.pure.u64(0),     // Balance floor
    ]
  });

  const policyCreateTx = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txCreatePolicy,
  });
  console.log(green(`   Policy creation transaction sent. Digest: ${policyCreateTx.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: policyCreateTx.digest });
  await sleep(2000);

  const policyCreateEffects = await SUI_CLIENT.getTransactionBlock({
    digest: policyCreateTx.digest,
    options: { showObjectChanges: true }
  });

  const policyCreatedObj = policyCreateEffects.objectChanges?.find(
    (change) => change.type === "created" && change.objectType.includes("WalletPolicy")
  );
  if (!policyCreatedObj || !("objectId" in policyCreatedObj)) {
    throw new Error("Failed to find created WalletPolicy ID in transaction effects.");
  }
  const dynamicPolicyId = policyCreatedObj.objectId;
  console.log(green(`   ✓ Shared WalletPolicy Object ID: ${dynamicPolicyId}`));

  // 3.5 Deposit dUSDC into the new WalletPolicy
  console.log(yellow("   Depositing dUSDC into the new WalletPolicy..."));
  const txDeposit = new Transaction();
  txDeposit.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::deposit`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txDeposit.object(dynamicPolicyId),
      txDeposit.object(dusdcCoinId)
    ]
  });

  const depositTx = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txDeposit,
  });
  console.log(green(`   dUSDC deposit transaction sent. Digest: ${depositTx.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: depositTx.digest });
  await sleep(2000);

  // 4. Register Agent with 0.1 SUI stake bond
  console.log(yellow("\n4. Registering agent with 0.1 SUI stake bond..."));
  try {
    const txRegister = new Transaction();
    const [stakeCoin] = txRegister.splitCoins(txRegister.gas, [100_000_000]); // 0.1 SUI
    txRegister.moveCall({
      target: `${AURA_PACKAGE_ID}::aura_registry::register_agent`,
      arguments: [
        txRegister.object(REGISTRY_OBJECT_ID),
        stakeCoin
      ]
    });

    const registerTx = await SUI_CLIENT.signAndExecuteTransaction({
      signer: ownerKeypair,
      transaction: txRegister,
    });
    console.log(green(`   Agent registered successfully. Transaction Digest: ${registerTx.digest}`));
    await SUI_CLIENT.waitForTransaction({ digest: registerTx.digest });
  } catch (error) {
    console.log(yellow(`   Agent registration skipped or already registered. (Proceeding...)`));
  }
  await sleep(2000);

  // 5. Success Path Strategy & Archiving execution
  console.log(yellow("\n5. Executing success path options trade cycle on-chain..."));
  console.log(cyan("   [Pre-flight SVI surface check ➔ Policy borrow ➔ DeepBook options trade ➔ Policy return ➔ Archival]"));
  
  const tradeResult = await executeTradeCycle(ownerKeypair, dynamicPolicyId, {
    mockMode: false,
    walrusMockFallback: true,
  });
  
  if (tradeResult.success) {
    console.log(green("   ✓ Success Path executed successfully on-chain!"));
    console.log(green(`     - Transaction Digest:     ${tradeResult.txDigest}`));
    console.log(green(`     - Walrus Audit Blob ID:   ${tradeResult.blobId}`));
  } else {
    throw new Error("Success path strategy loop failed on-chain execution.");
  }
  await sleep(2000);

  // 6. Verify On-Chain Adversarial Boundaries (Dry-Runs)
  console.log(yellow("\n6. Running adversarial edge case verification (dry-runs)..."));

  // 6.1 Exceed budget limit check (EBudgetExceeded = 4)
  console.log(magenta("   [Edge Case 1: Borrowing amount exceeding budget ceiling]"));
  const txExceedBudget = new Transaction();
  const [borrowedExceed, ticketExceed] = txExceedBudget.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::borrow_for_trade`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txExceedBudget.object(dynamicPolicyId),
      txExceedBudget.pure.u64(2_000_000_000), // 2000 dUSDC (budget limit is 1000 dUSDC)
      txExceedBudget.pure.address(DEEPBOOK_PREDICT_PACKAGE_ID),
    ]
  });
  txExceedBudget.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::return_and_complete`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txExceedBudget.object(dynamicPolicyId),
      borrowedExceed,
      ticketExceed
    ]
  });
  await assertTxReverts(txExceedBudget, ownerAddress, 4, "Borrowing past budget ceiling must fail");

  // 6.2 Non-allowlisted contract execution check (EContractNotAllowed = 2)
  console.log(magenta("   [Edge Case 2: Borrowing for non-allowlisted target contract]"));
  const txBadTarget = new Transaction();
  const badContractAddress = "0x0000000000000000000000000000000000000000000000000000000000000008";
  const [borrowedBad, ticketBad] = txBadTarget.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::borrow_for_trade`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txBadTarget.object(dynamicPolicyId),
      txBadTarget.pure.u64(100_000_000), // 100 dUSDC
      txBadTarget.pure.address(badContractAddress),
    ]
  });
  txBadTarget.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::return_and_complete`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txBadTarget.object(dynamicPolicyId),
      borrowedBad,
      ticketBad
    ]
  });
  await assertTxReverts(txBadTarget, ownerAddress, 2, "Non-allowlisted contract target must fail");

  // 6.3 Policy Expiration check (EPolicyExpired = 3)
  console.log(magenta("   [Edge Case 3: Borrowing from an expired policy]"));
  const txCreateExpiredPolicy = new Transaction();
  txCreateExpiredPolicy.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::create_policy`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txCreateExpiredPolicy.pure.address(ownerAddress),
      txCreateExpiredPolicy.pure.u64(1_000_000_000),
      txCreateExpiredPolicy.pure.vector("address", [DEEPBOOK_PREDICT_PACKAGE_ID]),
      txCreateExpiredPolicy.pure.u64(0), // expiration_epoch = 0 (always expired)
      txCreateExpiredPolicy.pure.u64(0),
    ]
  });
  
  const expiredPolicyTxResult = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txCreateExpiredPolicy,
  });
  await SUI_CLIENT.waitForTransaction({ digest: expiredPolicyTxResult.digest });
  await sleep(2000);
  
  const expiredPolicyEffects = await SUI_CLIENT.getTransactionBlock({
    digest: expiredPolicyTxResult.digest,
    options: { showObjectChanges: true }
  });
  
  const expiredPolicyObj = expiredPolicyEffects.objectChanges?.find(
    (change) => change.type === "created" && change.objectType.includes("WalletPolicy")
  );
  if (!expiredPolicyObj || !("objectId" in expiredPolicyObj)) {
    throw new Error("Failed to deploy temporary expired policy object.");
  }
  const expiredPolicyId = expiredPolicyObj.objectId;
  console.log(cyan(`     Temporary Expired Policy deployed at: ${expiredPolicyId}`));

  const txExpiredBorrow = new Transaction();
  const [borrowedExp, ticketExp] = txExpiredBorrow.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::borrow_for_trade`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txExpiredBorrow.object(expiredPolicyId),
      txExpiredBorrow.pure.u64(100_000_000),
      txExpiredBorrow.pure.address(DEEPBOOK_PREDICT_PACKAGE_ID),
    ]
  });
  txExpiredBorrow.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::return_and_complete`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txExpiredBorrow.object(expiredPolicyId),
      borrowedExp,
      ticketExp
    ]
  });
  
  await assertTxReverts(txExpiredBorrow, ownerAddress, 3, "Expired policy borrowing must fail");

  const txRevokeExpired = new Transaction();
  txRevokeExpired.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::revoke_policy`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txRevokeExpired.object(expiredPolicyId)
    ]
  });
  const revokeExpiredTx = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txRevokeExpired
  });
  await SUI_CLIENT.waitForTransaction({ digest: revokeExpiredTx.digest });
  console.log(green("     ✓ Expired policy successfully destroyed/revoked."));
  await sleep(2000);

  // 7. Admin Slashing Verification
  console.log(yellow("\n7. Executing admin slashing of agent..."));
  const txSlash = new Transaction();
  txSlash.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::slash_bond`,
    arguments: [
      txSlash.object(REGISTRY_OBJECT_ID),
      txSlash.pure.address(ownerAddress),
    ]
  });

  const slashTxResult = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txSlash,
  });
  console.log(green(`   Agent slashed successfully. Transaction Digest: ${slashTxResult.digest}`));
  await SUI_CLIENT.waitForTransaction({ digest: slashTxResult.digest });
  await sleep(2000);

  // Verify slashed agent is inactive
  console.log(magenta("   [Edge Case 4: Verifying slashed agent is inactive]"));
  const txCheckSlashed = new Transaction();
  txCheckSlashed.moveCall({
    target: `${AURA_PACKAGE_ID}::aura_registry::assert_valid_agent`,
    arguments: [
      txCheckSlashed.object(REGISTRY_OBJECT_ID),
      txCheckSlashed.pure.address(ownerAddress),
    ]
  });
  
  await assertTxReverts(txCheckSlashed, ownerAddress, 3, "Slashed agent assertion must fail");

  // 8. Dynamic Policy Cleanup (Revoke)
  console.log(yellow("\n8. Revoking dynamic policy and recovering full dUSDC balance..."));
  const txRevokeMain = new Transaction();
  txRevokeMain.moveCall({
    target: `${AURA_PACKAGE_ID}::agent_wallet_policy::revoke_policy`,
    typeArguments: [DUSDC_TYPE_TAG],
    arguments: [
      txRevokeMain.object(dynamicPolicyId)
    ]
  });
  const revokeMainTx = await SUI_CLIENT.signAndExecuteTransaction({
    signer: ownerKeypair,
    transaction: txRevokeMain
  });
  await SUI_CLIENT.waitForTransaction({ digest: revokeMainTx.digest });
  console.log(green(`   ✓ Dynamic Policy revoked. All dUSDC refunded. Tx digest: ${revokeMainTx.digest}`));

  console.log(cyan("\n===================================================================="));
  console.log(green("        All End-to-End Demo Steps & Security Boundary Checks Passed!        "));
  console.log(cyan("===================================================================="));
}

main().catch((error) => {
  console.error(red("\n❌ Demo execution failed with error:"), error);
  process.exit(1);
});
