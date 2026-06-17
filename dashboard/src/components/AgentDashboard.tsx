import React, { useEffect, useState, useMemo } from 'react';
import { SuiClient } from '@mysten/sui/client';
import {
  Award, Shield, ShieldAlert, ShieldCheck,
  TrendingUp, Users, RefreshCw,
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

// ─── Config ─────────────────────────────────────────────────────────────────
const PACKAGE_ID        = import.meta.env.VITE_AURA_PACKAGE_ID  || '';
const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '';
const SUI_RPC_URL       = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

// Instantiate once at module level — SuiClient is safe as a singleton.
const suiClient = new SuiClient({ url: SUI_RPC_URL });

// ─── Types ───────────────────────────────────────────────────────────────────
export interface AgentInfo {
  address:        string;
  /** Raw on-chain reputation score (0 – 1_000_000 = 0 – 100%) */
  reputation:     number;
  totalTasks:     number;
  successfulTasks: number;
  /** SUI, already divided by 1e9 */
  stakeAmount:    number;
  active:         boolean;
  blacklistUntil: number;
  latestBlobId:   string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert raw on-chain reputation score (0 – 1_000_000) to a percentage (0 – 100).
 * The contract stores reputation as 0-to-1_000_000 where 1_000_000 = 100%.
 */
const reputationPct = (raw: number) => (raw / 1_000_000) * 100;

/**
 * Generate deterministic-looking PnL index curves from agent stats.
 * Uses Math.sin seeded from the address so lines are stable across re-renders.
 * NOTE: This is purely illustrative — it is not real historical trading data.
 */
const generatePnLData = (agents: AgentInfo[]) => {
  const DAYS = 10;
  return Array.from({ length: DAYS }, (_, i) => {
    const row: Record<string, number | string> = { name: `Day ${i + 1}` };
    agents.forEach((agent) => {
      // Derive a stable seed from the last 6 chars of the address
      const seed = [...agent.address.slice(-6)].reduce(
        (acc, c) => acc + c.charCodeAt(0), 0,
      );
      const repFactor  = reputationPct(agent.reputation) / 100; // 0..1
      const slope      = (repFactor - 0.5) * 10;               // -5..+5 per day
      const volatility = (1 - repFactor) * 6;                  // lower rep → higher vol

      let pnl = 100;
      for (let d = 0; d <= i; d++) {
        pnl += slope + Math.sin(seed + d * 1.3) * volatility;
      }
      if (!agent.active) {
        // Slashed agent shows a visible drawdown trend
        pnl = Math.max(25, pnl - (DAYS - i) * 5);
      }

      const key = `${agent.address.substring(2, 8)}…`;
      row[key] = parseFloat(pnl.toFixed(2));
    });
    return row;
  });
};

// ─── Agent stat card ─────────────────────────────────────────────────────────
const StatTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: string;
}> = ({ icon, label, value, accent }) => (
  <div
    className="rounded-2xl p-5 flex items-center gap-4"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
  >
    <div
      className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
      style={{ background: `${accent}18`, color: accent }}
    >
      {icon}
    </div>
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
      <p className="text-xl font-bold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    </div>
  </div>
);

// ─── Main component ───────────────────────────────────────────────────────────
interface AgentDashboardProps {
  onSelectAgent: (agentAddress: string, blobId: string | null) => void;
}

// Chart color palette — accessible, non-neon
const CHART_COLORS = ['#4f6ef7', '#10b981', '#f59e0b', '#ef4444'];

export const AgentDashboard: React.FC<AgentDashboardProps> = ({ onSelectAgent }) => {
  const [agents, setAgents]       = useState<AgentInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchAgents = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!PACKAGE_ID || !REGISTRY_OBJECT_ID) {
          throw new Error('Missing environment config (VITE_AURA_PACKAGE_ID or VITE_REGISTRY_OBJECT_ID).');
        }

        // 1. Fetch registry to find the agents Table ID
        const registryObj = await suiClient.getObject({
          id: REGISTRY_OBJECT_ID,
          options: { showContent: true },
        });
        if (registryObj.error) throw new Error(`Registry object error: ${registryObj.error.code}`);

        const content = registryObj.data?.content;
        if (!content || content.dataType !== 'moveObject') throw new Error('Invalid registry object structure.');

        const tableId = (content.fields as Record<string, unknown> & {
          agents?: { fields?: { id?: { id?: string } } };
        }).agents?.fields?.id?.id;
        if (!tableId) throw new Error('Failed to resolve agents Table ID.');

        // 2. Query AgentRegistered events for addresses
        const eventType = `${PACKAGE_ID}::aura_registry::AgentRegistered`;
        const events = await suiClient.queryEvents({ query: { MoveEventType: eventType }, limit: 100 });

        const uniqueAddresses = new Set<string>();
        events.data.forEach((evt) => {
          const agent = (evt.parsedJson as { agent?: string } | null)?.agent;
          if (agent) uniqueAddresses.add(agent);
        });
        // Always include the known demo address as a fallback
        uniqueAddresses.add('0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676');

        // 3. Resolve each address from the dynamic Table fields
        const agentsData: AgentInfo[] = [];
        for (const address of uniqueAddresses) {
          try {
            const dynField = await suiClient.getDynamicFieldObject({
              parentId: tableId,
              name: { type: 'address', value: address },
            });
            if (dynField.data?.content?.dataType !== 'moveObject') continue;

            const rf = (dynField.data.content.fields as Record<string, unknown> & {
              value?: { fields?: Record<string, unknown> };
            }).value?.fields;
            if (!rf) continue;

            const rawScore       = parseInt(String(rf.reputation_score ?? '500000'), 10);
            const stakeRaw       = parseInt(
              String((rf.stake as { fields?: { value?: unknown } } | null)?.fields?.value ?? '0'), 10,
            );
            const totalTasks     = parseInt(String(rf.total_tasks ?? '0'), 10);
            const successfulTasks = parseInt(String(rf.successful_tasks ?? '0'), 10);
            const active         = rf.active !== false;
            const blacklistUntil = parseInt(String(rf.blacklist_until ?? '0'), 10);

            // Decode walrus_history_blob: Option<vector<u8>>
            let latestBlobId: string | null = null;
            const blobOpt = rf.walrus_history_blob as {
              type?: string; fields?: { vec?: unknown[] };
            } | null;
            if (blobOpt?.type?.includes('Option') && Array.isArray(blobOpt.fields?.vec) && blobOpt.fields!.vec.length > 0) {
              const byteVec = blobOpt.fields!.vec[0];
              latestBlobId = typeof byteVec === 'string'
                ? byteVec
                : String.fromCharCode(...(byteVec as number[]));
            }

            agentsData.push({
              address,
              reputation: rawScore,
              totalTasks,
              successfulTasks,
              stakeAmount: stakeRaw / 1_000_000_000,
              active,
              blacklistUntil,
              latestBlobId,
            });
          } catch (err) {
            console.warn(`Could not load record for agent ${address}:`, err);
          }
        }

        // Fallback demo data when registry returns nothing (e.g. fresh env)
        if (agentsData.length === 0) {
          agentsData.push(
            {
              address: '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676',
              reputation: 920_000,   // 92.0 %
              totalTasks: 48,
              successfulTasks: 44,
              stakeAmount: 0.01,
              active: true,
              blacklistUntil: 0,
              latestBlobId: 'xyfwRUYqWnmbw2C_9WUOMxrz1SMlJEzBumkoLg-AhFc',
            },
            {
              address: '0x3bf937ee2e95a129d1c0b392abde62551cf16757041a96f2ba1443f676ffb6a8',
              reputation: 400_000,   // 40.0 %
              totalTasks: 20,
              successfulTasks: 8,
              stakeAmount: 0.0,
              active: false,
              blacklistUntil: 0,
              latestBlobId: null,
            },
          );
        }

        if (active) {
          // Sort: active first, then by descending reputation
          agentsData.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return b.reputation - a.reputation;
          });
          setAgents(agentsData);
        }
      } catch (err) {
        if (active) setError((err as Error).message);
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchAgents();
    return () => { active = false; };
  }, [refreshKey]);

  // Memoize chart data so it only recomputes when agents change
  const pnlData = useMemo(() => generatePnLData(agents), [agents]);

  // Derived stats
  const totalAgents  = agents.length;
  const activeAgents = agents.filter(a => a.active).length;
  const avgRepPct    = totalAgents > 0
    ? agents.reduce((acc, a) => acc + reputationPct(a.reputation), 0) / totalAgents
    : 0;
  const totalStake   = agents.reduce((acc, a) => acc + a.stakeAmount, 0);

  return (
    <div className="space-y-7 py-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            Agent Registry Studio
          </h2>
          <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>
            Compare active trading agents, inspect reputation scores, and audit on-chain PnL telemetry.
          </p>
        </div>
        <button
          id="btn-sync-onchain"
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-[12px] font-semibold rounded-xl transition-all cursor-pointer disabled:opacity-60"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
          }}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync On-Chain State
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          className="px-4 py-3 rounded-xl text-[12px] flex items-start gap-2"
          style={{ background: 'var(--color-warning-bg)', border: '1px solid #fde68a', color: '#92400e' }}
        >
          <span className="mt-0.5">⚠️</span>
          <span><strong>Configuration note:</strong> {error} — Showing offline simulation data.</span>
        </div>
      )}

      {loading ? (
        <div className="flex h-52 items-center justify-center">
          <div className="spinner h-10 w-10" />
        </div>
      ) : (
        <>
          {/* Stat tiles */}
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              icon={<Users className="h-5 w-5" />}
              label="Registered Agents"
              value={`${totalAgents} total · ${activeAgents} active`}
              accent="var(--color-brand)"
            />
            <StatTile
              icon={<Award className="h-5 w-5" />}
              label="Avg Reputation Score"
              value={`${avgRepPct.toFixed(1)}%`}
              accent="var(--color-success)"
            />
            <StatTile
              icon={<Shield className="h-5 w-5" />}
              label="Collateral Locked"
              value={`${totalStake.toFixed(3)} SUI`}
              accent="#f59e0b"
            />
          </div>

          {/* Performance chart */}
          <div
            className="rounded-2xl p-6"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <h3
              className="text-[15px] font-semibold mb-1 flex items-center gap-2"
              style={{ color: 'var(--color-text-primary)' }}
            >
              <TrendingUp className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
              Reputation-Weighted Performance Index
            </h3>
            <p className="text-[12px] mb-5" style={{ color: 'var(--color-text-muted)' }}>
              Illustrative PnL curves derived from on-chain reputation scores. Not real historical trade data.
            </p>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pnlData} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--color-border)' }}
                    tickLine={false}
                  />
                  <YAxis
                    domain={['auto', 'auto']}
                    unit="%"
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--color-surface)',
                      border: '1px solid var(--color-border)',
                      borderRadius: '10px',
                      fontSize: '12px',
                      color: 'var(--color-text-primary)',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Legend
                    verticalAlign="top"
                    height={32}
                    wrapperStyle={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}
                  />
                  {agents.map((agent, idx) => {
                    const key = `${agent.address.substring(2, 8)}…`;
                    return (
                      <Line
                        key={agent.address}
                        type="monotone"
                        dataKey={key}
                        stroke={agent.active ? CHART_COLORS[idx % CHART_COLORS.length] : '#d1d5db'}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 5 }}
                        strokeDasharray={agent.active ? undefined : '5 4'}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Agents table */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div
              className="px-6 py-4 border-b flex items-center justify-between"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
            >
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Registered Agents Directory
              </h3>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {agents.length} agent{agents.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[13px]">
                <thead>
                  <tr
                    style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}
                    className="text-[11px] font-semibold uppercase tracking-wider"
                  >
                    {['Agent Address', 'Status', 'Reputation', 'Success Rate', 'Stake (SUI)', 'Telemetry', ''].map((h) => (
                      <th
                        key={h}
                        className={`px-5 py-3 ${h === '' ? 'text-right' : ''}`}
                        style={{ color: 'var(--color-text-muted)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => {
                    const repPct = reputationPct(agent.reputation);
                    const srPct  = agent.totalTasks > 0
                      ? ((agent.successfulTasks / agent.totalTasks) * 100).toFixed(1)
                      : '—';

                    return (
                      <tr
                        key={agent.address}
                        className="transition-colors"
                        style={{ borderBottom: '1px solid var(--color-border-soft)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {/* Address */}
                        <td className="px-5 py-3.5 font-mono text-[11px]" style={{ color: 'var(--color-text-primary)' }}>
                          {agent.address.substring(0, 14)}…{agent.address.slice(-6)}
                        </td>

                        {/* Status badge */}
                        <td className="px-5 py-3.5">
                          {agent.active ? (
                            agent.blacklistUntil > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--color-warning-bg)', color: '#92400e', border: '1px solid #fde68a' }}>
                                <ShieldAlert className="h-3 w-3" /> Suspended
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--color-success-bg)', color: '#065f46', border: '1px solid #6ee7b7' }}>
                                <ShieldCheck className="h-3 w-3" /> Active
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: 'var(--color-danger-bg)', color: '#991b1b', border: '1px solid #fca5a5' }}>
                              <ShieldAlert className="h-3 w-3" /> Slashed
                            </span>
                          )}
                        </td>

                        {/* Reputation with mini bar */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col gap-1 min-w-[90px]">
                            <span className="font-semibold text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                              {repPct.toFixed(1)}%
                            </span>
                            <div className="h-1.5 w-20 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${repPct}%`,
                                  background: repPct >= 70 ? 'var(--color-success)' : repPct >= 40 ? 'var(--color-warning)' : 'var(--color-danger)',
                                }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Success rate */}
                        <td className="px-5 py-3.5 text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {srPct !== '—' ? `${srPct}%` : '—'}
                          <span className="ml-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            ({agent.successfulTasks}/{agent.totalTasks})
                          </span>
                        </td>

                        {/* Stake */}
                        <td className="px-5 py-3.5 font-mono text-[12px]" style={{ color: 'var(--color-text-secondary)' }}>
                          {agent.stakeAmount.toFixed(3)}
                        </td>

                        {/* Blob ID */}
                        <td className="px-5 py-3.5">
                          {agent.latestBlobId ? (
                            <span
                              className="inline-block font-mono text-[10px] px-2 py-0.5 rounded truncate max-w-[100px]"
                              title={agent.latestBlobId}
                              style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}
                            >
                              {agent.latestBlobId.substring(0, 10)}…
                            </span>
                          ) : (
                            <span className="text-[11px] italic" style={{ color: 'var(--color-text-muted)' }}>No telemetry</span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-5 py-3.5 text-right">
                          <button
                            id={`btn-audit-${agent.address.substring(2, 8)}`}
                            onClick={() => onSelectAgent(agent.address, agent.latestBlobId)}
                            disabled={!agent.latestBlobId}
                            className="px-3.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            style={{
                              background: 'var(--color-brand-light)',
                              color: 'var(--color-brand)',
                              border: '1px solid #c7d3fd',
                            }}
                            onMouseEnter={e => {
                              if (!(e.currentTarget as HTMLButtonElement).disabled) {
                                (e.currentTarget as HTMLElement).style.background = 'var(--color-brand)';
                                (e.currentTarget as HTMLElement).style.color = '#fff';
                              }
                            }}
                            onMouseLeave={e => {
                              (e.currentTarget as HTMLElement).style.background = 'var(--color-brand-light)';
                              (e.currentTarget as HTMLElement).style.color = 'var(--color-brand)';
                            }}
                          >
                            Audit Telemetry
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
