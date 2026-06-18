import { Transaction } from "@mysten/sui/transactions";
import { EventId } from "@mysten/sui/client";
import { 
  SUI_CLIENT, 
  AURA_PACKAGE_ID,
  DUSDC_TYPE_TAG,
  getAgentKeypair
} from "./config.js";

async function main() {
  const ownerKeypair = getAgentKeypair();
  const ownerAddress = ownerKeypair.toSuiAddress();
  console.log(`Sweeping testnet for abandoned policies for owner: ${ownerAddress}`);

  let hasNextPage = true;
  let cursor: EventId | null = null;
  let policiesRecovered = 0;

  while (hasNextPage) {
    const events = await SUI_CLIENT.queryEvents({
      query: { MoveEventType: `${AURA_PACKAGE_ID}::agent_wallet_policy::PolicyCreated` },
      cursor,
      limit: 50
    });

    for (const ev of events.data) {
      if (ev.sender !== ownerAddress) continue;
      const policyId = (ev.parsedJson as any)?.policy_id;
      if (!policyId) continue;
      
      console.log(`Found PolicyCreated event for policy: ${policyId}. Attempting to revoke...`);
      try {
        const tx = new Transaction();
        tx.moveCall({
          target: `${AURA_PACKAGE_ID}::agent_wallet_policy::revoke_policy`,
          typeArguments: [DUSDC_TYPE_TAG],
          arguments: [tx.object(policyId)]
        });

        const txRes = await SUI_CLIENT.signAndExecuteTransaction({
          signer: ownerKeypair,
          transaction: tx,
        });
        await SUI_CLIENT.waitForTransaction({ digest: txRes.digest });
        console.log(`✅ Successfully revoked policy ${policyId} (Tx: ${txRes.digest})`);
        policiesRecovered++;
      } catch (err) {
        const msg = (err as Error).message;
        if (!msg.includes("Could not find the referenced object") && !msg.includes("ObjectDeleted")) {
          console.error(`❌ Failed to revoke policy ${policyId}:`, msg);
        }
      }
    }
    
    hasNextPage = events.hasNextPage;
    cursor = events.nextCursor ?? null;
  }

  console.log(`\n🎉 Swept and recovered funds from ${policiesRecovered} abandoned agent policies!`);
}

main().catch(console.error);
