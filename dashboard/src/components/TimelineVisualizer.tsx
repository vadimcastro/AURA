import React, { useEffect, useState } from 'react';
import { Clock, FileText, ArrowRight, AlertTriangle, Wifi, WifiOff } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────
export interface SealEnvelope {
  policyObjectId: string;
  sealVersion:    string;
  ciphertext:     string;
  iv:             string;
  tag:            string;
  timestamp:      string;
  blobId:         string;
  _note?:         string;
}

interface TimelineVisualizerProps {
  agentAddress:    string;
  blobId:          string | null;
  onSelectEnvelope: (envelope: SealEnvelope) => void;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const WALRUS_AGGREGATOR =
  import.meta.env.VITE_WALRUS_AGGREGATOR || 'https://aggregator.walrus-testnet.walrus.space';

// ─── Demo fallback ────────────────────────────────────────────────────────────
const makeDemoEnvelope = (id: string): SealEnvelope => ({
  policyObjectId: '0x319dd6c61b960465c27652dd2aff3638d3d00eeea4b6776f57d895f0134fae49',
  // Matches sdk/walrus_archiver.ts encryptWithSeal() which sets sealVersion: "1.0.0-mock"
  sealVersion:    '1.0.0-mock',
  // Simulated AES-256-GCM ciphertext (random bytes, cannot be decrypted with real key)
  ciphertext:     '4f2e519280d0d8e8749e7552aa54ef85c8f8b1c41b80d0d8e8749e7552aa54ef85c8f8b1c41b80',
  // IV and tag match what the real Node.js crypto module would produce (12 bytes IV, 16 bytes tag)
  iv:             'a1b2c3d4e5f60708090a0b0c',
  tag:            'd9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4',
  timestamp:      new Date().toISOString(),
  blobId:         id,
  _note:          'Mocked from local fallback due to CORS/network constraints',
});

// ─── Component ────────────────────────────────────────────────────────────────
export const TimelineVisualizer: React.FC<TimelineVisualizerProps> = ({
  agentAddress,
  blobId,
  onSelectEnvelope,
}) => {
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [envelope, setEnvelope] = useState<SealEnvelope | null>(null);
  const [isMocked, setIsMocked] = useState(false);

  useEffect(() => {
    if (!blobId) {
      setEnvelope(null);
      setError(null);
      setIsMocked(false);
      return;
    }

    let active = true;
    const fetchBlob = async () => {
      setLoading(true);
      setError(null);
      setIsMocked(false);

      try {
        const url = `${WALRUS_AGGREGATOR}/v1/${blobId}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Omit<SealEnvelope, 'blobId'>;
        if (active) setEnvelope({ ...data, blobId });
      } catch (err) {
        console.warn('Walrus fetch failed, using demo mock:', err);
        if (active) {
          setEnvelope(makeDemoEnvelope(blobId));
          setIsMocked(true);
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchBlob();
    return () => { active = false; };
  }, [blobId]);

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!blobId) {
    return (
      <div
        className="rounded-2xl p-8 text-center"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <FileText className="mx-auto h-10 w-10 mb-3" style={{ color: 'var(--color-text-muted)' }} />
        <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          No Telemetry Selected
        </h3>
        <p className="mt-2 text-[13px] max-w-xs mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
          Select an agent above and click <strong>Audit Telemetry</strong> to load its Walrus history.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex justify-between items-center border-b"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
      >
        <div>
          <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Telemetry Timeline
          </h3>
          <p className="text-[11px] font-mono mt-0.5 truncate max-w-[220px]" style={{ color: 'var(--color-text-muted)' }}>
            {agentAddress.substring(0, 16)}…{agentAddress.slice(-6)}
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          {isMocked ? (
            <>
              <WifiOff className="h-3.5 w-3.5" style={{ color: 'var(--color-warning)' }} />
              <span style={{ color: 'var(--color-warning)' }}>Offline simulation</span>
            </>
          ) : loading ? (
            <>
              <div className="spinner h-3 w-3" />
              <span style={{ color: 'var(--color-text-muted)' }}>Fetching…</span>
            </>
          ) : (
            <>
              <Wifi className="h-3.5 w-3.5" style={{ color: 'var(--color-success)' }} />
              <span style={{ color: 'var(--color-success)' }}>Walrus connected</span>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-5">
        {loading ? (
          <div className="flex justify-center items-center py-14">
            <div className="spinner h-9 w-9" />
          </div>
        ) : envelope ? (
          <div className="relative border-l-2 pl-5 ml-2 py-1" style={{ borderColor: 'var(--color-border)' }}>
            {/* Timeline dot */}
            <span
              className="absolute -left-[9px] top-2 flex h-4 w-4 items-center justify-center rounded-full"
              style={{ background: 'var(--color-brand)', boxShadow: '0 0 0 3px var(--color-brand-light)' }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
            </span>

            {/* Timestamp + blob */}
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1 mb-4">
              <span className="text-[12px] font-semibold flex items-center gap-1.5" style={{ color: 'var(--color-brand)' }}>
                <Clock className="h-3.5 w-3.5" />
                {new Date(envelope.timestamp).toLocaleString()}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                Blob: {envelope.blobId.substring(0, 14)}…
              </span>
            </div>

            {/* Envelope card */}
            <div
              className="rounded-xl p-4 space-y-3 text-[12px]"
              style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
            >
              <div className="flex justify-between items-center pb-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Seal Version</span>
                <span className="font-mono font-medium" style={{ color: 'var(--color-text-primary)' }}>{envelope.sealVersion}</span>
              </div>

              <div className="flex justify-between items-center pb-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Policy Object</span>
                <span
                  className="font-mono text-[10px] truncate max-w-[160px] sm:max-w-[220px]"
                  title={envelope.policyObjectId}
                  style={{ color: 'var(--color-text-primary)' }}
                >
                  {envelope.policyObjectId}
                </span>
              </div>

              {/* Ciphertext preview */}
              <div>
                <p className="text-[11px] font-medium mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>
                  Ciphertext (AES-GCM)
                </p>
                <div
                  className="font-mono text-[10px] p-3 rounded-lg break-all leading-relaxed"
                  style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                >
                  {envelope.ciphertext.substring(0, 80)}…
                </div>
              </div>

              {/* IV + Tag */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>IV</p>
                  <p className="font-mono text-[10px] break-all" style={{ color: 'var(--color-brand)' }}>{envelope.iv}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>Auth Tag</p>
                  <p className="font-mono text-[10px] break-all" style={{ color: 'var(--color-brand)' }}>{envelope.tag}</p>
                </div>
              </div>

              {isMocked && (
                <p className="text-[10px] italic pt-1" style={{ color: 'var(--color-text-muted)' }}>
                  ⚠ Walrus aggregator unreachable — using offline simulation payload for demo purposes.
                </p>
              )}

              <button
                id="btn-load-decryption"
                onClick={() => onSelectEnvelope(envelope)}
                className="w-full group inline-flex items-center justify-center gap-2 rounded-lg py-2.5 text-[12px] font-semibold text-white transition-all duration-200 cursor-pointer hover:opacity-90"
                style={{ background: 'var(--color-brand)' }}
              >
                Load into Decryption Engine
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center rounded-xl" style={{ border: '1px solid var(--color-border)' }}>
            <AlertTriangle className="mx-auto h-8 w-8 mb-2" style={{ color: 'var(--color-warning)' }} />
            <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
              {error || 'Failed to resolve envelope data.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
