import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

// ESM __dirname resolution
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface MemWalConfig {
  apiUrl: string;
  token: string;
  backupDir: string;
}

export class MemWalClient {
  private config: MemWalConfig;
  private isSimulationMode: boolean;

  constructor(config: Partial<MemWalConfig> = {}) {
    const defaultBackupDir = path.resolve(__dirname, "./.memwal_cache");
    this.config = {
      apiUrl: config.apiUrl || "https://memwal-playground.walrus-testnet.walrus.space",
      token: config.token || "",
      backupDir: config.backupDir || defaultBackupDir,
    };

    // Determine if we should fall back to simulation mode
    this.isSimulationMode =
      !this.config.token ||
      this.config.token.includes("placeholder") ||
      this.config.token.trim() === "";

    if (this.isSimulationMode) {
      console.warn("⚠️ MemWalClient: No valid token provided. Operating in SIMULATION mode (local file cache).");
    }

    // Ensure the backup/simulation directory exists
    try {
      if (!fs.existsSync(this.config.backupDir)) {
        fs.mkdirSync(this.config.backupDir, { recursive: true });
      }
    } catch (error) {
      console.error(`❌ MemWalClient: Failed to create cache directory ${this.config.backupDir}:`, error);
    }
  }

  /**
   * Helper to write to local cache file for simulation/backup
   */
  private writeToLocalCache(key: string, data: any): void {
    try {
      const filePath = path.join(this.config.backupDir, `${this.sanitizeKey(key)}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      console.error(`❌ MemWalClient: Local cache write failed for key '${key}':`, error);
    }
  }

  /**
   * Helper to read from local cache file
   */
  private readFromLocalCache(key: string): any | null {
    try {
      const filePath = path.join(this.config.backupDir, `${this.sanitizeKey(key)}.json`);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        return JSON.parse(content);
      }
    } catch (error) {
      console.warn(`⚠️ MemWalClient: Local cache read failed or file not found for key '${key}':`, error);
    }
    return null;
  }

  /**
   * Sanitizes key to prevent directory traversal
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_\-]/g, "_");
  }

  /**
   * Checks if running in simulation mode
   */
  public inSimulationMode(): boolean {
    return this.isSimulationMode;
  }

  /**
   * Writes session data to MemWal storage (or falls back to local simulation)
   */
  public async writeSessionData(key: string, payload: any): Promise<boolean> {
    // Write locally first as a backup / simulator path
    this.writeToLocalCache(key, payload);

    if (this.isSimulationMode) {
      console.log(`[MemWal Simulation] Successfully stored key: ${key}`);
      return true;
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/v1/memory/${key}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.log(`[MemWal Live] Successfully uploaded key: ${key}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ MemWalClient: Live write failed for key '${key}' (${(error as Error).message}). Falling back to local cache.`);
      // We already wrote it to cache, so we return true as successful fallback write
      return true;
    }
  }

  /**
   * Reads session data from MemWal storage (or falls back to local simulation)
   */
  public async readSessionData(key: string): Promise<any | null> {
    if (this.isSimulationMode) {
      console.log(`[MemWal Simulation] Successfully retrieved key: ${key}`);
      return this.readFromLocalCache(key);
    }

    try {
      const response = await fetch(`${this.config.apiUrl}/v1/memory/${key}`, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${this.config.token}`,
        },
      });

      if (response.status === 404) {
        // Not found, check local cache
        return this.readFromLocalCache(key);
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[MemWal Live] Successfully retrieved key: ${key}`);
      return data;
    } catch (error) {
      console.warn(`⚠️ MemWalClient: Live read failed for key '${key}' (${(error as Error).message}). Querying local cache fallback.`);
      return this.readFromLocalCache(key);
    }
  }
}
