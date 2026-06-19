import { Transaction } from "@mysten/sui/transactions";
import { EventId } from "@mysten/sui/client";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID,
  DUSDC_TYPE_TAG,
  getAgentKeypair
} from "./config.js";

async function getBalances(address: string) {
  try {
    const suiBal = await SUI_CLIENT.getBalance({ owner: address });
    const usdcBal = await SUI_CLIENT.getBalance({ owner: address, coinType: DUSDC_TYPE_TAG });
    return {
      sui: BigInt(suiBal.totalBalance),
      usdc: BigInt(usdcBal.totalBalance)
    };
  } catch (err) {
    console.error(`⚠️ Failed to fetch balance for ${address}:`, (err as Error).message);
    return { sui: 0n, usdc: 0n };
  }
}

async function main() {
  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  console.log(`====================================================`);
  console.log(`🛡️ AURA Funds Recovery & Policy Sweeper`);
  console.log(`Owner Address: ${ownerAddress}`);
  console.log(`====================================================\n`);

  // Log initial balances
  console.log(`⏳ Checking initial balances...`);
  const initial = await getBalances(ownerAddress);
  console.log(`   SUI Gas Balance : ${(Number(initial.sui) / 1e9).toFixed(4)} SUI (${initial.sui} MIST)`);
  console.log(`   dUSDC Balance   : ${(Number(initial.usdc) / 1e9).toFixed(4)} dUSDC (${initial.usdc} subunits)\n`);

  // Target packages: support CLI arg, fallback to current + historical
  let targetPackages = [AURA_PACKAGE_ID];
  
  const historicalPackages = [
    "0x7cb617c78407fdae14a8e51f12da5cd7c7abf2dc67f6c0c58c5fdb8ce40dd922",
    "0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef"
  ];

  const cliArg = process.argv[2];
  if (cliArg) {
    if (cliArg.startsWith("0x")) {
      console.log(`👉 Targeting CLI-specified package: ${cliArg}`);
      targetPackages = [cliArg];
    } else {
      console.log(`⚠️ Invalid CLI package format: ${cliArg}. Reverting to standard sweep.`);
    }
  } else {
    // Include historical if not already there
    for (const p of historicalPackages) {
      if (!targetPackages.includes(p) && p !== AURA_PACKAGE_ID) {
        targetPackages.push(p);
      }
    }
  }

  console.log(`🔍 Sweeping across ${targetPackages.length} package(s):`);
  targetPackages.forEach(p => console.log(`   - ${p}`));
  console.log("");

  let policiesRecovered = 0;

  for (const pkgId of targetPackages) {
    if (pkgId.includes("placeholder")) {
      console.log(`⚠️ Skipping placeholder package: ${pkgId}`);
      continue;
    }
    console.log(`📡 Querying PolicyCreated events for package: ${pkgId}...`);
    let hasNextPage = true;
    let cursor: EventId | null = null;

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
          
          console.log(`   Found PolicyCreated event for policy: ${policyId}. Revoking...`);
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
            console.log(`   ✅ Successfully revoked policy ${policyId} (Tx: ${txRes.digest})`);
            policiesRecovered++;
          } catch (err) {
            const msg = (err as Error).message;
            if (msg.includes("Could not find the referenced object") || msg.includes("ObjectDeleted") || msg.includes("does not exist") || msg.includes("deleted")) {
              // Policy already revoked/deleted
              console.log(`   ℹ️ Policy ${policyId} was already revoked or deleted.`);
            } else {
              console.error(`   ❌ Failed to revoke policy ${policyId}:`, msg);
            }
          }
        }
        
        hasNextPage = events.hasNextPage;
        cursor = events.nextCursor ?? null;
      } catch (err) {
        console.error(`   ⚠️ Failed to query events for package ${pkgId}:`, (err as Error).message);
        hasNextPage = false;
      }
    }
  }

  // Log final balances and changes
  console.log(`\n⏳ Checking final balances...`);
  const final = await getBalances(ownerAddress);
  const diffSui = final.sui - initial.sui;
  const diffUsdc = final.usdc - initial.usdc;

  console.log(`====================================================`);
  console.log(`🎉 Sweeping completed!`);
  console.log(`Policies Revoked   : ${policiesRecovered}`);
  console.log(`SUI Gas Recovered  : ${(Number(diffSui) / 1e9).toFixed(4)} SUI (${diffSui >= 0n ? "+" : ""}${diffSui} MIST)`);
  console.log(`dUSDC Recovered    : ${(Number(diffUsdc) / 1e9).toFixed(4)} dUSDC (${diffUsdc >= 0n ? "+" : ""}${diffUsdc} subunits)`);
  console.log(`Final SUI Balance  : ${(Number(final.sui) / 1e9).toFixed(4)} SUI`);
  console.log(`Final dUSDC Balance: ${(Number(final.usdc) / 1e9).toFixed(4)} dUSDC`);
  console.log(`====================================================`);
}

main().catch(console.error);

