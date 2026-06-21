import React, { useState, useEffect } from 'react';
import { ShieldAlert, CheckCircle, Clock, RefreshCw, AlertTriangle, AlertCircle } from 'lucide-react';

interface EscalationItem {
  id: string;
  timestamp: number;
  agentName: string;
  reason: string;
  confidence: number;
  status: 'PENDING' | 'APPROVED';
}

export const EscalationInbox: React.FC = () => {
  const [daemonUrl, setDaemonUrl] = useState(() => localStorage.getItem('aura_daemon_url') || import.meta.env.VITE_DAEMON_URL || 'http://localhost:3000');
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('aura_admin_key') || '');
  const [escalations, setEscalations] = useState<EscalationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  const fetchEscalations = async () => {
    if (escalations.length === 0) {
      setLoading(true);
    }
    setError(null);
    try {
      const res = await fetch(`${daemonUrl}/api/escalations`);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const data = await res.json();
      setEscalations(data);
    } catch (e) {
      console.error(e);
      setError('Could not fetch escalations. Please verify Daemon URL is correct and online.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEscalations();
    // Auto-poll every 5 seconds
    const interval = setInterval(fetchEscalations, 5000);
    return () => clearInterval(interval);
  }, [daemonUrl]);

  const handleApprove = async (id: string) => {
    setActionId(id);
    try {
      const res = await fetch(`${daemonUrl}/api/escalations/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey
        },
        body: JSON.stringify({ id })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      // Re-fetch list
      await fetchEscalations();
    } catch (e) {
      alert(`Approval failed: ${(e as Error).message}`);
    } finally {
      setActionId(null);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Settings / Connection Config */}
      <div
        className="rounded-2xl p-6 space-y-5 lg:col-span-1"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <AlertCircle className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Daemon Controller
          </h3>
        </div>

        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Configure connection details to query the off-chain bot daemon logs and execute manual override actions.
        </p>

        <div className="space-y-4 text-[12px]">
          <div>
            <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Daemon Host URL
            </label>
            <input
              type="text"
              value={daemonUrl}
              onChange={(e) => {
                setDaemonUrl(e.target.value);
                localStorage.setItem('aura_daemon_url', e.target.value);
              }}
              placeholder="e.g. https://your-daemon.up.railway.app"
              className="w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
            {daemonUrl.includes('.vercel.app') && (
              <div className="mt-2 text-[10px] text-red-500 font-semibold flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>Error: Do not use the Vercel frontend URL here. Use your Railway backend service URL (e.g. https://your-daemon.up.railway.app).</span>
              </div>
            )}
            <span className="text-[10px] mt-1 block italic" style={{ color: 'var(--color-text-muted)' }}>
              Note: This is the Railway API backend URL, not the Vercel frontend dashboard.
            </span>
          </div>

          <div>
            <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              Admin Secret Key
            </label>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => {
                setAdminKey(e.target.value);
                localStorage.setItem('aura_admin_key', e.target.value);
              }}
              placeholder="Enter admin password"
              className="w-full p-2.5 rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)]"
              style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            />
            <span className="text-[10px] mt-1 block italic" style={{ color: 'var(--color-text-muted)' }}>
              Note: This matches the `ADMIN_API_KEY` set in your Railway environment variables.
            </span>
          </div>
        </div>
      </div>

      {/* Escalation Queue */}
      <div
        className="rounded-2xl p-6 lg:col-span-2 space-y-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Human-in-the-Loop Escalation Inbox
            </h3>
          </div>
          <button
            onClick={fetchEscalations}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer border"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
          >
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {error && (
          <div
            className="rounded-xl p-4 text-[12px] flex gap-2"
            style={{ background: 'var(--color-danger-bg)', border: '1px solid #fcd5d5', color: 'var(--color-danger)' }}
          >
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="font-medium">{error}</p>
          </div>
        )}

        {!loading && escalations.length === 0 && !error && (
          <div className="text-center py-16 space-y-2">
            <CheckCircle className="mx-auto h-10 w-10 text-[var(--color-success)] opacity-40" />
            <h4 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>All Systems Nominal</h4>
            <p className="text-[12px] max-w-xs mx-auto text-[var(--color-text-muted)]">
              No active security alerts or low-confidence trade anomalies have tripped the TS Sandbox thresholds.
            </p>
          </div>
        )}

        <div className="space-y-4">
          {escalations.map((item) => (
            <div
              key={item.id}
              className="rounded-xl p-4 border space-y-3 transition-all duration-200"
              style={{
                borderColor: item.status === 'PENDING' ? '#fecaca' : 'var(--color-border)',
                background: item.status === 'PENDING' ? 'rgba(254, 242, 242, 0.4)' : 'var(--color-surface-2)'
              }}
            >
              <div className="flex justify-between items-start gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[13px]" style={{ color: 'var(--color-text-primary)' }}>
                      {item.agentName}
                    </span>
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                        item.status === 'PENDING'
                          ? 'bg-red-50 text-red-600 border-red-200'
                          : 'bg-green-50 text-green-600 border-green-200'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    <Clock className="h-3 w-3" />
                    <span>{new Date(item.timestamp).toLocaleString()}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    Confidence Matrix
                  </span>
                  <p className="font-mono font-bold text-[13px]" style={{ color: item.confidence < 0.60 ? '#f43f5e' : 'var(--color-success)' }}>
                    {(item.confidence * 100).toFixed(0)}%
                  </p>
                </div>
              </div>

              <div
                className="p-3 rounded-lg text-[12px] border font-mono whitespace-pre-wrap leading-relaxed"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
              >
                {item.reason}
              </div>

              {item.status === 'PENDING' && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => handleApprove(item.id)}
                    disabled={actionId === item.id}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all cursor-pointer hover:opacity-95 bg-red-500 disabled:opacity-50"
                  >
                    {actionId === item.id ? 'Approving...' : 'Approve Override / Resume Agent'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
