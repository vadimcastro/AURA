import React, { useState, useEffect } from 'react';
import { Play, Square, RefreshCw, Settings, ShieldCheck, Activity, Database, AlertTriangle } from 'lucide-react';

export const CloudOperatorPanel: React.FC = () => {
  const [daemonUrl, setDaemonUrl] = useState(() => localStorage.getItem('aura_daemon_url') || import.meta.env.VITE_DAEMON_URL || 'http://localhost:3000');
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('aura_admin_key') || '');
  const [daemonStatus, setDaemonStatus] = useState<'STOPPED' | 'RUNNING' | 'ERROR' | 'UNKNOWN'>('UNKNOWN');
  const [daemonBalances, setDaemonBalances] = useState<{ sui: string; dUSDC: string } | null>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>(['Console initialized. AURA Operator Panel ready.']);

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${text}`]);
  };

  const checkDaemonStatus = async () => {
    if (!daemonUrl) return;
    try {
      const res = await fetch(`${daemonUrl}/api/status`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setDaemonStatus(data.status === 'RUNNING' ? 'RUNNING' : 'STOPPED');
      setDaemonBalances(data.ownerBalances);
    } catch (e) {
      setDaemonStatus('ERROR');
      setDaemonBalances(null);
      addLog(`Status Check Failed: ${(e as Error).message}`);
    }
  };

  useEffect(() => {
    checkDaemonStatus();
    const interval = setInterval(checkDaemonStatus, 8000);
    return () => clearInterval(interval);
  }, [daemonUrl]);

  const triggerDaemonAction = async (endpoint: 'start' | 'stop' | 'recover', body: any = {}) => {
    if (!daemonUrl || isActionLoading) return;
    setIsActionLoading(true);
    addLog(`Sending POST request to /api/${endpoint}...`);
    try {
      const res = await fetch(`${daemonUrl}/api/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': adminKey
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP error ${res.status}`);
      }
      addLog(`Success: ${data.message || JSON.stringify(data)}`);
      await checkDaemonStatus();
    } catch (e) {
      addLog(`Error: ${(e as Error).message}`);
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Production Integration Banner */}
      <div 
        className="rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border"
        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Operator Production Environment
            </h3>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
            Connected App domain: <strong className="font-mono text-[var(--color-brand)]">auraregistry.vercel.app</strong>. 
            All off-chain telemetry operations are securely recorded and committed on-chain.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">
            Active Registry Node
          </span>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Connection Setup */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <Database className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Daemon Connection
            </h3>
          </div>

          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
            Provide the host endpoint of your running copy-trade daemon (e.g. running on Railway or localhost) and the configured secret key.
          </p>

          <div className="space-y-4 text-[12px]">
            <div>
              <label className="block text-[10px] mb-1 font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Daemon Control URL
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
              <label className="block text-[10px] mb-1 font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Admin API Key
              </label>
              <input
                type="password"
                value={adminKey}
                onChange={(e) => {
                  setAdminKey(e.target.value);
                  localStorage.setItem('aura_admin_key', e.target.value);
                }}
                placeholder="Enter API Key / Password"
                className="w-full p-2.5 rounded-xl border focus:outline-none"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
              <span className="text-[10px] mt-1 block italic" style={{ color: 'var(--color-text-muted)' }}>
                Note: This matches the `ADMIN_API_KEY` set in your Railway environment variables.
              </span>
            </div>

            <button
              onClick={checkDaemonStatus}
              className="w-full py-2.5 rounded-xl text-xs font-semibold border cursor-pointer hover:bg-[var(--color-surface-2)] transition-all"
              style={{ color: 'var(--color-text-primary)', borderColor: 'var(--color-border)' }}
            >
              Ping Daemon Status
            </button>
          </div>
        </div>

        {/* Control Actions & Status */}
        <div
          className="rounded-2xl p-6 space-y-5"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <Activity className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Execution Control
            </h3>
          </div>

          <div className="space-y-4 text-[12px]">
            {/* Status Badges */}
            <div 
              className="p-3 rounded-xl border flex items-center justify-between" 
              style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
            >
              <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Agent Status:</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                daemonStatus === 'RUNNING' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400' :
                daemonStatus === 'STOPPED' ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400' :
                daemonStatus === 'ERROR' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400' :
                'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
              }`}>
                {daemonStatus}
              </span>
            </div>

            {/* Balances */}
            {daemonBalances ? (
              <div 
                className="p-3 rounded-xl border space-y-2" 
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
              >
                <div className="flex justify-between font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Daemon Wallet SUI:</span>
                  <span className="font-mono text-[var(--color-text-primary)]">{parseFloat(daemonBalances.sui).toFixed(4)} SUI</span>
                </div>
                <div className="flex justify-between font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                  <span>Daemon Wallet dUSDC:</span>
                  <span className="font-mono text-[var(--color-text-primary)]">{parseFloat(daemonBalances.dUSDC).toFixed(2)} dUSDC</span>
                </div>
              </div>
            ) : (
              <div 
                className="p-3 rounded-xl border text-center text-[var(--color-text-muted)] italic" 
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
              >
                Ping daemon to fetch wallet balances
              </div>
            )}

            {/* Loop Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => triggerDaemonAction('start', { intervalMs: 30000 })}
                disabled={isActionLoading || daemonStatus === 'RUNNING'}
                className="py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-opacity"
              >
                <Play className="h-3 w-3 fill-current" /> Start Agent
              </button>
              <button
                onClick={() => triggerDaemonAction('stop')}
                disabled={isActionLoading || daemonStatus === 'STOPPED'}
                className="py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-opacity"
              >
                <Square className="h-3 w-3 fill-current" /> Stop Agent
              </button>
            </div>

            <button
              onClick={() => triggerDaemonAction('recover')}
              disabled={isActionLoading || daemonStatus === 'ERROR'}
              className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer transition-opacity"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Reclaim All Policy Funds
            </button>
          </div>
        </div>

        {/* Live Logs Console */}
        <div
          className="rounded-2xl p-6 lg:col-span-1 flex flex-col justify-between"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          <div className="flex items-center gap-2 pb-2 border-b mb-3" style={{ borderColor: 'var(--color-border)' }}>
            <Settings className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Audit trace logs
            </h3>
          </div>

          <div
            className="p-3.5 rounded-xl border font-mono text-[10px] space-y-1.5 h-[220px] overflow-y-auto flex-grow"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
          >
            {logs.map((log, idx) => (
              <div 
                key={idx} 
                className={log.includes('Error') ? 'text-red-500' : log.includes('Success') ? 'text-emerald-500' : ''}
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
