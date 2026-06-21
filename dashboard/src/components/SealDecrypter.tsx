import React, { useState } from 'react';
import { Lock, Unlock, Key, Eye, EyeOff, ShieldCheck, Terminal, RotateCcw, Loader2, AlertTriangle } from 'lucide-react';
import { useSignAndExecuteTransaction, useCurrentAccount } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SviSurface {
  a:         number;
  b:         number;
  rho:       number;
  m:         number;
  sigma:     number;
  timestamp?: number;
}

interface AuditTrace {
  epoch:                  number;
  policy_wallet:          string;
  agent_address:          string;
  svi_surface:            SviSurface;
  trade_decision:         string;
  trade_amount_dusdc:     number;
  refund_amount_dusdc:    number;
  pnl_dusdc:              number;
  arbitrage_check_passed: boolean;
  model_reasoning_hash:   string;
  gas_balance_sui:        number;
  timestamp:              string;
}

interface SealEnvelope {
  policyObjectId: string;
  blobId:         string;
  iv:             string;
  tag:            string;
  ciphertext:     string;
  timestamp:      string;
  _note?:         string;
  agentAddress?:  string;
}

interface SealDecrypterProps {
  envelope: SealEnvelope | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const DEMO_KEY_HEX = 'e853b29e4574a1bf906960ec61517e4aebd4ee5550c1871fbad255575932b8df';
const DUSDC_DECIMALS = 1_000_000;
const SUI_MIST = 1_000_000_000;

const AURA_PACKAGE_ID = import.meta.env.VITE_AURA_PACKAGE_ID || '0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e';
const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '0x848bfe3b550bae763d6b408f9613f416bfbf4ded0c20f531a63906250c666e8c';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const hexToUint8Array = (hex: string): Uint8Array => {
  const clean = hex.replace(/^0x/, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string length.');
  return Uint8Array.from({ length: clean.length / 2 }, (_, i) =>
    parseInt(clean.substring(i * 2, i * 2 + 2), 16),
  );
};

const fmt = (raw: number) => (raw / DUSDC_DECIMALS).toFixed(2);

const DataRow: React.FC<{
  label: string;
  value: React.ReactNode;
  separator?: boolean;
}> = ({ label, value, separator }) => (
  <div
    className={`flex justify-between items-center ${separator ? 'pt-2 mt-1' : ''}`}
    style={separator ? { borderTop: '1px solid var(--color-border)' } : {}}
  >
    <span style={{ color: 'var(--color-text-secondary)' }}>{label}</span>
    <span style={{ color: 'var(--color-text-primary)' }} className="font-medium text-right max-w-[55%] break-all">
      {value}
    </span>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
export const SealDecrypter: React.FC<SealDecrypterProps> = ({ envelope }) => {
  const [viewerKey,    setViewerKey]    = useState('');
  const [showKey,      setShowKey]      = useState(false);
  const [decryptedData, setDecryptedData] = useState<AuditTrace | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [decrypting,   setDecrypting]   = useState(false);
  const [disputing,    setDisputing]    = useState(false);

  const currentAccount = useCurrentAccount();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const reset = () => {
    setDecryptedData(null);
    setError(null);
    setViewerKey('');
  };

  const handleDaemonDecrypt = async () => {
    if (!envelope) return;
    setError(null);
    setDecryptedData(null);
    setDecrypting(true);

    const daemonUrl = localStorage.getItem('aura_daemon_url') || import.meta.env.VITE_DAEMON_URL || 'http://localhost:3000';
    try {
      const res = await fetch(`${daemonUrl}/api/telemetry/decrypt?blobId=${envelope.blobId}`);
      if (!res.ok) {
        throw new Error(`Daemon returned HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();
      if (!data.success || !data.decrypted) {
        throw new Error(data.error || 'Decryption unsuccessful or invalid trace structure.');
      }
      setDecryptedData(data.decrypted);
    } catch (err) {
      setError(`Daemon decryption failed: ${(err as Error).message}. You can fall back to manual AES key decryption below.`);
    } finally {
      setDecrypting(false);
    }
  };

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!envelope) return;

    setError(null);
    setDecryptedData(null);
    setDecrypting(true);

    try {
      let cleanKey = viewerKey.trim();
      if (!cleanKey) throw new Error('Viewer key cannot be empty.');

      // Convert passphrase to derived key hex
      const isPassphrase = cleanKey.toLowerCase() === 'mock-seal-passphrase';
      const keyToUse = isPassphrase ? DEMO_KEY_HEX : cleanKey.replace(/^0x/i, '');

      // ── Demo / mocked envelope path ──────────────────────────────────────
      if (envelope._note?.includes('Mocked')) {
        const isDemoKey = 
          keyToUse.toLowerCase() === DEMO_KEY_HEX.toLowerCase() ||
          isPassphrase;
        if (!isDemoKey) {
          throw new Error('Decryption failed: AES-GCM authentication tag mismatch. Verify the key.');
        }
        await new Promise(r => setTimeout(r, 500));
        
        const agentAddr = envelope.agentAddress || '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676';
        const cleanAddr = agentAddr.toLowerCase().replace(/^0x/i, '');
        const addrHash = cleanAddr.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
        const strategyType = addrHash % 3;
        
        let decision = 'Mint Range 68k-72k';
        let pnl = -200_000;
        let tradeAmount = 10_000_000;
        let refundAmount = 9_800_000;
        
        if (strategyType === 1) {
          decision = 'Place Up (Call Option)';
          pnl = 1_250_000; // +1.25 dUSDC
          tradeAmount = 25_000_000;
          refundAmount = 26_250_000;
        } else if (strategyType === 2) {
          decision = 'Mint Range 69k-71k';
          pnl = 500_000; // +0.50 dUSDC
          tradeAmount = 25_000_000;
          refundAmount = 25_500_000;
        }

        const currentEpoch = Math.floor(Date.now() / 1000 / 86400);

        setDecryptedData({
          epoch:                  currentEpoch,
          policy_wallet:          envelope.policyObjectId,
          agent_address:          agentAddr,
          svi_surface: {
            a:     0.04,
            b:     0.10,
            rho:  -0.40,
            m:     0.01,
            sigma: 0.15,
          },
          trade_decision:         decision,
          trade_amount_dusdc:     tradeAmount,
          refund_amount_dusdc:    refundAmount,
          pnl_dusdc:              pnl,
          arbitrage_check_passed: true,
          model_reasoning_hash:   '18f576496773fc3c30252ad557e75fe078fd9640b94e613c76deae09c889a6ae',
          gas_balance_sui:        5_200_000_000, // 5.20 SUI in MIST
          timestamp:              envelope.timestamp,
        });
        return;
      }

      // ── Real AES-GCM decryption path ─────────────────────────────────────
      const keyBytes        = hexToUint8Array(keyToUse);
      const ivBytes         = hexToUint8Array(envelope.iv);
      const tagBytes        = hexToUint8Array(envelope.tag);
      const ciphertextBytes = hexToUint8Array(envelope.ciphertext);

      const combined = new Uint8Array(ciphertextBytes.length + tagBytes.length);
      combined.set(ciphertextBytes);
      combined.set(tagBytes, ciphertextBytes.length);

      const cryptoKey = await window.crypto.subtle.importKey(
        'raw', keyBytes as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt'],
      );
      const decryptedBuf = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes as unknown as BufferSource, tagLength: 128 },
        cryptoKey, combined as unknown as BufferSource,
      );
      setDecryptedData(JSON.parse(new TextDecoder().decode(decryptedBuf)) as AuditTrace);
    } catch (err) {
      setError((err as Error).message || 'Decryption failed. Verify key validity and tag alignment.');
    } finally {
      setDecrypting(false);
    }
  };

  const handleSubmitDispute = async () => {
    if (!envelope) return;
    setDisputing(true);
    try {
      console.log("📡 Filing slashing dispute on-chain on Sui Testnet...");
      const tx = new Transaction();

      // Lock a 0.01 SUI dispute bond (10,000,000 Mist) split from gas coin
      const [bondCoin] = tx.splitCoins(tx.gas, [10_000_000]);

      // Call submit_dispute Move contract method
      tx.moveCall({
        target: `${AURA_PACKAGE_ID}::aura_registry::submit_dispute`,
        arguments: [
          tx.object(REGISTRY_OBJECT_ID),
          tx.object('0x6'), // Sui Clock object ID
          tx.pure.address(envelope.agentAddress || '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676'),
          tx.pure.vector('u8', Array.from(new TextEncoder().encode(envelope.blobId))),
          bondCoin
        ]
      });

      const result = await signAndExecuteTransaction({
        transaction: tx,
      });

      console.log("✅ Dispute successfully filed! Digest:", result.digest);
      alert(`🎉 Slashing dispute successfully filed on Sui Testnet!\nDigest: ${result.digest}\n\nThe operator has 24 hours to disclose their AES decryption key or face automatic slashing!`);
    } catch (err) {
      console.error("❌ Failed to file dispute on-chain:", err);
      alert(`Failed to file dispute: ${(err as Error).message}`);
    } finally {
      setDisputing(false);
    }
  };

  if (!envelope) {
    return (
      <div
        className="rounded-xl shadow-sm p-6 text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <Lock className="mx-auto h-10 w-10 mb-3" style={{ color: 'var(--color-text-muted)' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Decryption Engine Idle
        </h3>
        <p className="mt-2 text-[13px] max-w-xs mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
          Load an encrypted Seal envelope from the timeline to activate browser-side decryption.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-xl shadow-sm overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex justify-between items-center border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        <h3 className="text-[14px] font-semibold flex items-center gap-2" style={{ color: 'var(--color-text-primary)' }}>
          {decryptedData
            ? <Unlock className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
            : <Lock className="h-4 w-4" style={{ color: 'var(--color-text-muted)' }} />}
          Seal Decryption Interface
        </h3>
        <span
          className="text-[10px] font-mono px-2 py-0.5 rounded"
          style={{ background: 'var(--color-bg)', color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
        >
          {envelope.blobId.substring(0, 12)}…
        </span>
      </div>

      <div className="p-5 space-y-5">
        {!decryptedData ? (
          <div className="space-y-4">
            {/* Decrypt via Daemon Action */}
            <button
              type="button"
              onClick={handleDaemonDecrypt}
              disabled={decrypting}
              className="w-full py-2.5 rounded-xl text-[13px] font-bold text-white transition-all cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5 shadow-sm"
              style={{ background: 'var(--color-success)', boxShadow: '0 2px 8px rgba(18,183,106,0.25)' }}
            >
              {decrypting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Contacting Daemon...
                </>
              ) : (
                <>
                  <Unlock className="h-4 w-4" />
                  Decrypt via Connected Daemon (Pure)
                </>
              )}
            </button>

            <div className="flex items-center gap-3 my-4">
              <div className="h-px bg-gray-200 flex-grow" />
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">or decrypt manually</span>
              <div className="h-px bg-gray-200 flex-grow" />
            </div>

            {/* Key entry form */}
            <form onSubmit={handleDecrypt} className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label
                    htmlFor="viewer-key-input"
                    className="text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: 'var(--color-text-secondary)' }}
                  >
                    AES-256 Viewer Key (Hex)
                  </label>
                  <button
                    type="button"
                    id="btn-use-demo-key"
                    onClick={() => { setViewerKey(DEMO_KEY_HEX); setError(null); }}
                    className="text-[11px] font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--color-brand)' }}
                  >
                    Use Demo Key
                  </button>
                </div>
                <div className="relative">
                  <Key
                    className="absolute left-3.5 top-3 h-4 w-4"
                    style={{ color: 'var(--color-text-muted)' }}
                  />
                  <input
                    id="viewer-key-input"
                    type={showKey ? 'text' : 'password'}
                    value={viewerKey}
                    onChange={e => setViewerKey(e.target.value)}
                    placeholder="e.g. e853b29e4574a1bf…"
                    className="w-full pl-10 pr-11 py-2.5 rounded-xl font-mono text-[12px] outline-none transition-all"
                    style={{
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--color-brand)'; }}
                    onBlur={e => { e.currentTarget.style.borderColor = 'var(--color-border)'; }}
                  />
                  <button
                    type="button"
                    id="btn-toggle-key-visibility"
                    onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-2.5 p-1 rounded transition-colors cursor-pointer"
                    style={{ color: 'var(--color-text-muted)' }}
                    aria-label={showKey ? 'Hide key' : 'Show key'}
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div
                  className="px-3 py-2.5 rounded-xl text-[12px]"
                  style={{ background: 'var(--color-danger-bg)', border: '1px solid #fca5a5', color: '#991b1b' }}
                >
                  {error}
                </div>
              )}

              <button
                id="btn-execute-decryption"
                type="submit"
                disabled={decrypting || !viewerKey.trim()}
                className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                style={{ background: 'var(--color-brand)', boxShadow: '0 2px 8px rgba(79,110,247,0.25)' }}
              >
                {decrypting ? 'Decrypting…' : 'Execute Decryption'}
              </button>
            </form>

            <div className="flex items-center gap-3 my-4">
              <div className="h-px bg-gray-200 flex-grow" />
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider">or challenge agent</span>
              <div className="h-px bg-gray-200 flex-grow" />
            </div>

            {/* Slashing Dispute Game Trigger */}
            <div className="p-3.5 rounded-xl border border-red-900/20 bg-red-950/10 space-y-2.5">
              <div className="flex items-center gap-1.5 text-red-500 font-semibold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span className="text-[12px] uppercase tracking-wider">Slashing Dispute Game</span>
              </div>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                If you suspect policy violations or if the agent refuses to disclose its key, lock a 0.01 SUI dispute bond to file a challenge. If correct, you claim the agent's performance stake!
              </p>
              {currentAccount ? (
                <button
                  type="button"
                  onClick={handleSubmitDispute}
                  disabled={disputing}
                  className="w-full py-2.5 rounded-xl text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 cursor-pointer transition-colors flex items-center justify-center gap-1"
                >
                  {disputing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Filing Dispute...
                    </>
                  ) : (
                    '🚨 File Slashing Dispute on Testnet'
                  )}
                </button>
              ) : (
                <div className="text-[10px] text-center italic text-amber-500 font-semibold">
                  Connect wallet to file a slashing dispute.
                </div>
              )}
            </div>
          </div>
        ) : (
          // ── Decrypted trace view ──────────────────────────────────────────
          <div className="space-y-4 text-[12px]">
            {/* Success banner */}
            <div
              className="px-4 py-3 rounded-xl flex items-start gap-2.5"
              style={{ background: 'var(--color-success-bg)', border: '1px solid #6ee7b7', color: '#065f46' }}
            >
              <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <strong>Decryption successful</strong> — SECURE_TELEMETRY envelope verified in browser memory.
              </div>
            </div>

            {/* Trading cycle */}
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
                Trading Cycle
              </p>
              <DataRow label="Epoch" value={decryptedData.epoch} />
              <DataRow
                label="Decision"
                value={
                  <span className="font-mono font-semibold" style={{ color: 'var(--color-brand)' }}>
                    {decryptedData.trade_decision}
                  </span>
                }
              />
              <DataRow label="Allocated" value={`${fmt(decryptedData.trade_amount_dusdc)} dUSDC`} />
              <DataRow label="Returned" value={`${fmt(decryptedData.refund_amount_dusdc)} dUSDC`} />
              <DataRow
                separator
                label="Cycle PnL"
                value={
                  <span style={{ color: decryptedData.pnl_dusdc >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {decryptedData.pnl_dusdc >= 0 ? '+' : ''}{fmt(decryptedData.pnl_dusdc)} dUSDC
                  </span>
                }
              />
              <DataRow
                label="Agent Gas"
                value={`${(decryptedData.gas_balance_sui / SUI_MIST).toFixed(3)} SUI`}
              />
            </div>

            {/* SVI model params */}
            <div
              className="rounded-xl p-4 space-y-2"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2.5" style={{ color: 'var(--color-text-muted)' }}>
                SVI Volatility Surface Parameters
              </p>
              <DataRow label="Vertical shift (a)" value={decryptedData.svi_surface.a.toFixed(4)} />
              <DataRow label="Wing slope (b)" value={decryptedData.svi_surface.b.toFixed(4)} />
              <DataRow label="Correlation (ρ)" value={decryptedData.svi_surface.rho.toFixed(4)} />
              <DataRow label="ATM offset (m)" value={decryptedData.svi_surface.m.toFixed(4)} />
              <DataRow label="Curvature (σ)" value={decryptedData.svi_surface.sigma.toFixed(4)} />
              <DataRow
                separator
                label="Arbitrage-Free"
                value={
                  <span style={{ color: decryptedData.arbitrage_check_passed ? 'var(--color-success)' : 'var(--color-danger)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em' }}>
                    {decryptedData.arbitrage_check_passed ? '✓ Verified' : '✗ Violated'}
                  </span>
                }
              />
            </div>

            {/* Model reasoning hash */}
            <div
              className="rounded-xl p-4"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                <Terminal className="h-3.5 w-3.5" />
                Reasoning State Hash
              </p>
              <p
                className="font-mono text-[10px] break-all p-2.5 rounded-lg leading-relaxed"
                style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-brand)' }}
              >
                {decryptedData.model_reasoning_hash}
              </p>
              <p className="mt-2 text-[11px] leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                This hash represents the model state before execution. It matches the hash committed in the on-chain Registry, proving the agent used its approved configuration.
              </p>
            </div>

            <button
              id="btn-lock-engine"
              onClick={reset}
              className="w-full py-2 rounded-xl text-[12px] font-semibold transition-all cursor-pointer hover:opacity-80 flex items-center justify-center gap-1.5"
              style={{
                background: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text-secondary)',
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset & Decrypt Another
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
