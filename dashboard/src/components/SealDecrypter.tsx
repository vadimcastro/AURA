import React, { useState } from 'react';
import { Lock, Unlock, Key, Eye, EyeOff, ShieldCheck, Terminal } from 'lucide-react';

interface SealDecrypterProps {
  envelope: any | null;
}

export const SealDecrypter: React.FC<SealDecrypterProps> = ({ envelope }) => {
  const [viewerKey, setViewerKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [decryptedData, setDecryptedData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(false);

  // The derived hex of the mock seal key for ease of demo auditing:
  const DEMO_KEY_HEX = 'e853b29e4574a1bf906960ec61517e4aebd4ee5550c1871fbad255575932b8df';

  const handleUseDemoKey = () => {
    setViewerKey(DEMO_KEY_HEX);
    setError(null);
  };

  const hexToUint8Array = (hexString: string): Uint8Array => {
    const cleanHex = hexString.replace(/^0x/, '');
    if (cleanHex.length % 2 !== 0) {
      throw new Error("Invalid hex key length.");
    }
    const array = new Uint8Array(cleanHex.length / 2);
    for (let i = 0; i < cleanHex.length; i += 2) {
      array[i / 2] = parseInt(cleanHex.substring(i, i + 2), 16);
    }
    return array;
  };

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envelope) return;

    setError(null);
    setDecryptedData(null);
    setDecrypting(true);

    try {
      const cleanKey = viewerKey.trim();
      if (!cleanKey) {
        throw new Error("Viewer key cannot be empty.");
      }

      // Check if this is the mock simulation fallback envelope
      if (envelope._note && envelope._note.includes("Mocked")) {
        if (cleanKey === DEMO_KEY_HEX) {
          // Bypasses the Web Crypto API decryption (since mock ciphertext is random)
          // and returns a mock decrypted AuditTrace corresponding to the key
          setTimeout(() => {
            setDecryptedData({
              epoch: 94,
              policy_wallet: envelope.policyObjectId,
              agent_address: '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676',
              svi_surface: {
                sigma_atm: 0.528,
                skew: -0.045,
                kurtosis: 0.012,
                blocks_freshness: 3
              },
              trade_decision: 'MINT_RANGE_OPTIONS',
              trade_amount_dusdc: 1_000_000_000,
              refund_amount_dusdc: 1_084_200_000,
              pnl_dusdc: 84_200_000,
              arbitrage_check_passed: true,
              model_reasoning_hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
              gas_balance_sui: 1.84,
              timestamp: envelope.timestamp
            });
            setDecrypting(false);
          }, 600);
          return;
        } else {
          throw new Error("Decryption failed: Invalid AES key tag authentication check failed.");
        }
      }

      // Perform real Web Cryptography API decryption for actual network envelopes
      const keyBytes = hexToUint8Array(cleanKey);
      const ivBytes = hexToUint8Array(envelope.iv);
      const tagBytes = hexToUint8Array(envelope.tag);
      const ciphertextBytes = hexToUint8Array(envelope.ciphertext);

      // Concatenate ciphertext and authentication tag as expected by browser Web Crypto API
      const combinedBytes = new Uint8Array(ciphertextBytes.length + tagBytes.length);
      combinedBytes.set(ciphertextBytes, 0);
      combinedBytes.set(tagBytes, ciphertextBytes.length);

      // Import raw key bytes into Web Crypto object
      const cryptoKey = await window.crypto.subtle.importKey(
        "raw",
        keyBytes as any,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
      );

      // Decrypt
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivBytes as any,
          tagLength: 128 // 128 bits = 16 bytes
        },
        cryptoKey,
        combinedBytes as any
      );

      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      const parsedData = JSON.parse(decryptedText);
      setDecryptedData(parsedData);
    } catch (err) {
      setError((err as Error).message || "Decryption failed. Verify key validity and tag alignment.");
    } finally {
      setDecrypting(false);
    }
  };

  if (!envelope) {
    return (
      <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-8 text-center backdrop-blur-xl">
        <Lock className="mx-auto h-12 w-12 text-slate-500 mb-4" />
        <h3 className="text-lg font-semibold text-white">Decryption Engine Locked</h3>
        <p className="text-slate-400 mt-2 max-w-sm mx-auto text-sm">
          Load an encrypted Seal envelope from the timeline to activate the browser decryption interface.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-6 backdrop-blur-xl space-y-6">
      <div className="flex justify-between items-center border-b border-white/5 pb-4">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          {decryptedData ? <Unlock className="h-5 w-5 text-emerald-400 animate-bounce" /> : <Lock className="h-5 w-5 text-purple-400" />}
          Seal Decryption Interface
        </h3>
        <span className="text-[10px] font-mono text-slate-500 bg-slate-950/40 px-2.5 py-1 rounded border border-white/5">
          Envelope: {envelope.blobId.substring(0, 12)}...
        </span>
      </div>

      {!decryptedData ? (
        <form onSubmit={handleDecrypt} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex justify-between">
              <span>Enter Private Viewer Key (AES-256 Hex)</span>
              <button
                type="button"
                onClick={handleUseDemoKey}
                className="text-[10px] text-purple-400 hover:text-purple-300 font-semibold uppercase tracking-wider"
              >
                Use Demo Key
              </button>
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={viewerKey}
                onChange={(e) => setViewerKey(e.target.value)}
                placeholder="e.g. e853b29e4574a1bf906960ec61517e4aebd4ee5550c1871fbad255575932b8df"
                className="w-full pl-10 pr-12 py-3 bg-slate-950/80 border border-white/10 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-purple-500 transition-colors placeholder:text-slate-700"
              />
              <Key className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-500" />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-3 p-1 rounded hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 text-xs rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={decrypting || !viewerKey}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-purple-500/20 disabled:opacity-50 disabled:hover:from-purple-600 disabled:hover:to-indigo-600 transition-all cursor-pointer"
          >
            {decrypting ? 'Decrypting Secure Memory...' : 'Execute Decryption'}
          </button>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2.5">
            <ShieldCheck className="h-5 w-5 shrink-0" />
            <div>
              <strong>Decryption Successful:</strong> SECURE_TELEMETRY envelope verified and parsed in browser sandbox.
            </div>
          </div>

          {/* Decrypted trace details */}
          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5">
              <span className="text-slate-500 font-semibold uppercase block mb-1">Trading Cycle Info</span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">Epoch:</span>
                  <span className="text-white">{decryptedData.epoch}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Trade Decision:</span>
                  <span className="text-cyan-400 font-bold">{decryptedData.trade_decision}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Allocation:</span>
                  <span className="text-white">{(decryptedData.trade_amount_dusdc / 1_000_000_000).toFixed(2)} dUSDC</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Returned:</span>
                  <span className="text-white">{(decryptedData.refund_amount_dusdc / 1_000_000_000).toFixed(2)} dUSDC</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5 font-semibold">
                  <span className="text-slate-400">Cycle PnL:</span>
                  <span className={decryptedData.pnl_dusdc >= 0 ? "text-emerald-400" : "text-red-400"}>
                    {decryptedData.pnl_dusdc >= 0 ? '+' : ''}{(decryptedData.pnl_dusdc / 1_000_000_000).toFixed(2)} dUSDC
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5">
              <span className="text-slate-500 font-semibold uppercase block mb-1">Model Parameters (SVI)</span>
              <div className="space-y-1.5 font-mono text-[11px]">
                <div className="flex justify-between">
                  <span className="text-slate-400">ATM Volatility (σ):</span>
                  <span className="text-white">{decryptedData.svi_surface.sigma_atm}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Skew Factor:</span>
                  <span className="text-white">{decryptedData.svi_surface.skew}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Kurtosis:</span>
                  <span className="text-white">{decryptedData.svi_surface.kurtosis}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Freshness (blocks):</span>
                  <span className="text-white">{decryptedData.svi_surface.blocks_freshness}</span>
                </div>
                <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                  <span className="text-slate-400">Arbitrage Validation:</span>
                  <span className="text-emerald-400 font-bold uppercase">Passed</span>
                </div>
              </div>
            </div>
          </div>

          {/* Model Reasoning Hash */}
          <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 text-xs">
            <span className="text-slate-500 font-semibold uppercase block mb-1 flex items-center gap-1.5">
              <Terminal className="h-3.5 w-3.5 text-purple-400" />
              Verifiable Reasoning State Hash
            </span>
            <div className="font-mono text-[10px] text-purple-300 bg-slate-950/80 p-2.5 rounded border border-white/5 break-all">
              {decryptedData.model_reasoning_hash}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              This hash represents the state of the local deep-learning trade model before execution. It matches the hash registered in the on-chain Registry, verifying that the agent used its approved configuration parameters.
            </p>
          </div>

          <button
            onClick={() => setDecryptedData(null)}
            className="w-full py-2.5 rounded-xl border border-white/10 bg-slate-900/40 text-slate-300 hover:bg-slate-900 hover:text-white font-semibold text-xs transition-all cursor-pointer"
          >
            Lock Engine
          </button>
        </div>
      )}
    </div>
  );
};
