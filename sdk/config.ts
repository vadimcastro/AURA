import { SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import * as dotenv from "dotenv";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM __dirname resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, "./.env") });
// Fallback check in parent folder if ts-node runs from different root contexts
dotenv.config({ path: path.resolve(__dirname, "../.env") });

export const SUI_RPC_URL = process.env.SUI_RPC_URL || "https://fullnode.testnet.sui.io:443";
export const PREDICT_SERVER = process.env.PREDICT_SERVER || "https://predict-server.testnet.mystenlabs.com";
export const WALRUS_PUBLISHER = process.env.WALRUS_PUBLISHER || "https://publisher.walrus-testnet.walrus.space";
export const WALRUS_AGGREGATOR = process.env.WALRUS_AGGREGATOR || "https://aggregator.walrus-testnet.walrus.space";

export const AURA_PACKAGE_ID = process.env.AURA_PACKAGE_ID || "0x0000000000000000000000000000000000000000000000000000000000000001";
export const REGISTRY_OBJECT_ID = process.env.REGISTRY_OBJECT_ID || "0x0000000000000000000000000000000000000000000000000000000000000002";
export const WALLET_POLICY_OBJECT_ID = process.env.WALLET_POLICY_OBJECT_ID || "0x0000000000000000000000000000000000000000000000000000000000000003";

export const DEEPBOOK_PREDICT_PACKAGE_ID = process.env.DEEPBOOK_PREDICT_PACKAGE_ID || "0x0000000000000000000000000000000000000000000000000000000000000004";
export const DEEPBOOK_POOL_ID = process.env.DEEPBOOK_POOL_ID || "0x0000000000000000000000000000000000000000000000000000000000000005";
export const DUSDC_TYPE_TAG = process.env.DUSDC_TYPE_TAG || "0x0000000000000000000000000000000000000000000000000000000000000004::dusdc::DUSDC";

export const MEMWAL_API_URL = process.env.MEMWAL_API_URL || "https://memwal-playground.walrus-testnet.walrus.space";
export const MEMWAL_TOKEN = process.env.MEMWAL_TOKEN || "";

export const SUI_CLIENT = new SuiClient({ url: SUI_RPC_URL });

/**
 * Parses and returns the agent's keypair from the environment,
 * falling back to a random keypair if the environment has a placeholder.
 */
export function getAgentKeypair(): Ed25519Keypair {
  const privateKey = process.env.AGENT_PRIVATE_KEY;
  if (!privateKey || privateKey.includes("placeholder")) {
    console.warn("⚠️ AGENT_PRIVATE_KEY not configured or is a placeholder. Generating a temporary random keypair.");
    return new Ed25519Keypair();
  }

  try {
    if (privateKey.startsWith("suiprivkey")) {
      return Ed25519Keypair.fromSecretKey(privateKey);
    }
    // Attempt parsing as raw secret key (hex or array representation if needed)
    return Ed25519Keypair.fromSecretKey(privateKey);
  } catch (error) {
    console.error("❌ Failed to parse AGENT_PRIVATE_KEY. Falling back to temporary random keypair.", error);
    return new Ed25519Keypair();
  }
}
