import { SUI_CLIENT } from "./config.js";

async function main() {
  const registryAgentsTableId = "0x59826af80a1133ffba5e2d91ec57387f31627ea960110b0adcc1d66d2f1e4712";
  console.log(`Fetching dynamic fields for table: ${registryAgentsTableId}...`);

  const fields = await SUI_CLIENT.getDynamicFields({
    parentId: registryAgentsTableId,
  });

  console.log(`Found ${fields.data.length} dynamic fields.`);
  
  for (const f of fields.data) {
    const agentAddress = f.name.value;
    
    // Fetch the object content
    const obj = await SUI_CLIENT.getObject({
      id: f.objectId,
      options: { showContent: true }
    });
    
    const fieldsData = (obj.data?.content as any)?.fields?.value?.fields;
    if (fieldsData) {
      const active = fieldsData.active;
      const rep = fieldsData.reputation_score;
      const historyVec = fieldsData.walrus_history_blob;
      
      if (historyVec !== null && historyVec !== undefined) {
        console.log(`Agent: ${agentAddress}`);
        console.log(`  Raw walrus_history_blob:`, JSON.stringify(historyVec));
        const blobId = typeof historyVec === "string" ? historyVec : JSON.stringify(historyVec);
        console.log(`  Active: ${active}`);
        console.log(`  Reputation: ${rep}`);
        console.log(`  Latest Blob ID: ${blobId}`);
      }
    }
  }
}

main().catch(console.error);
