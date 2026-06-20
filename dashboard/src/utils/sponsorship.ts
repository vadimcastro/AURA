import { Transaction } from '@mysten/sui/transactions';
import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';

interface SponsorResponse {
  success: boolean;
  signature: string;
  error?: string;
}

/**
 * Executes a Sui transaction block using AURA's native Paymaster gas sponsorship service.
 * This enables Web2 zkLogin users to execute on-chain transactions without holding SUI tokens.
 * 
 * @param params Object containing execution parameters
 * @param params.transaction The prepared Transaction block to execute
 * @param params.suiClient The active SuiJsonRpcClient instance
 * @param params.senderAddress The zkLogin or browser wallet address of the sender
 * @param params.walletSignCallback The callback to request the sender's signature
 * @param params.daemonUrl The endpoint of AURA's running API daemon backend
 * @returns The transaction execution response
 */
export async function executeSponsoredTransaction(params: {
  transaction: Transaction;
  suiClient: SuiClient;
  senderAddress: string;
  walletSignCallback: (txBytes: Uint8Array) => Promise<{ signature: string }>;
  daemonUrl: string;
}): Promise<any> {
  const { transaction, suiClient, senderAddress, walletSignCallback, daemonUrl } = params;

  try {
    // 1. Fetch the paymaster address from the daemon's status endpoint
    const statusRes = await fetch(`${daemonUrl}/api/status`);
    if (!statusRes.ok) {
      throw new Error(`Failed to ping daemon status: ${statusRes.statusText}`);
    }
    const statusData = await statusRes.json();
    const paymasterAddress = statusData.ownerAddress;
    if (!paymasterAddress) {
      throw new Error('Sponsorship failed: Could not determine daemon paymaster SUI address.');
    }

    // 2. Set transaction metadata (sender signs logic, paymaster signs gas)
    transaction.setSender(senderAddress);
    transaction.setGasOwner(paymasterAddress);

    // 3. Build the transaction block on the client side using the Sui fullnode
    const transactionBlockBytes = await transaction.build({ client: suiClient });
    
    // Browser-compatible Uint8Array to base64 conversion
    let binary = '';
    const len = transactionBlockBytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(transactionBlockBytes[i]);
    }
    const base64Bytes = window.btoa(binary);

    // 4. Request gas sponsorship from AURA's backend paymaster endpoint
    const sponsorRes = await fetch(`${daemonUrl}/api/paymaster/sponsor`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ txBytes: base64Bytes })
    });

    if (!sponsorRes.ok) {
      const errData = await sponsorRes.json();
      throw new Error(errData.error || `Sponsor endpoint returned HTTP ${sponsorRes.status}`);
    }

    const sponsorData: SponsorResponse = await sponsorRes.json();
    if (!sponsorData.success || !sponsorData.signature) {
      throw new Error(sponsorData.error || 'Sponsor signature missing from backend response.');
    }

    // 5. Request the user's signature (via zkLogin signature or browser wallet)
    const userSignatureObj = await walletSignCallback(transactionBlockBytes);

    // 6. Broadcast the fully signed transaction block on-chain
    const executeResult = await suiClient.executeTransactionBlock({
      transactionBlock: transactionBlockBytes,
      signature: [userSignatureObj.signature, sponsorData.signature],
      options: {
        showEffects: true,
        showEvents: true
      }
    });

    return executeResult;
  } catch (err) {
    console.error('❌ Sponsored transaction execution failed:', err);
    throw err;
  }
}
