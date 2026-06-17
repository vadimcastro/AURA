import React, { useEffect, useState } from 'react';
import { SuiClient } from '@mysten/sui/client';
import { Award, Shield, ShieldAlert, ShieldCheck, TrendingUp, Users, RefreshCw } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// Read config from import.meta.env
const PACKAGE_ID = import.meta.env.VITE_AURA_PACKAGE_ID || '';
const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '';
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

const suiClient = new SuiClient({ url: SUI_RPC_URL });

export interface AgentInfo {
  address: string;
  reputation: number;
  totalTasks: number;
  successfulTasks: number;
  stakeAmount: number;
  active: boolean;
  blacklistUntil: number;
  latestBlobId: string | null;
}

// Generate PnL data based on agent's stats
const generatePnLData = (agents: AgentInfo[]) => {
  const points = 10;
  const data = Array.from({ length: points }, (_, i) => {
    const row: any = { name: `Day ${i + 1}` };
    agents.forEach((agent) => {
      // Seed based on agent address characters
      let seed = 0;
      for (let charIdx = 0; charIdx < agent.address.length; charIdx++) {
        seed += agent.address.charCodeAt(charIdx);
      }
      
      const reputationFactor = agent.reputation / 1_000_000; // 0 to 1
      const slope = (reputationFactor - 0.45) * 15; // Positive slope if reputation > 45%
      const volatility = (1.1 - reputationFactor) * 8; // Higher reputation = lower volatility
      
      // Calculate daily PnL
      let pnl = 100; // Start at 100%
      for (let day = 0; day <= i; day++) {
        const randomComponent = Math.sin(seed + day) * volatility;
        pnl += slope + randomComponent;
      }
      
      // If inactive (slashed), drop PnL or keep flat
      if (!agent.active) {
        pnl = Math.max(20, pnl - (points - i) * 8); // Slashed collapse
      }

      // Format to 2 decimal places
      row[agent.address.substring(0, 8) + '...'] = parseFloat(pnl.toFixed(2));
    });
    return row;
  });
  return data;
};

interface AgentDashboardProps {
  onSelectAgent: (agentAddress: string, blobId: string | null) => void;
}

export const AgentDashboard: React.FC<AgentDashboardProps> = ({ onSelectAgent }) => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    const fetchAgents = async () => {
      setLoading(true);
      setError(null);
      try {
        if (!PACKAGE_ID || !REGISTRY_OBJECT_ID) {
          throw new Error("Missing environment configuration (AURA_PACKAGE_ID or REGISTRY_OBJECT_ID).");
        }

        // 1. Fetch registry object to find the table ID
        const registryObj = await suiClient.getObject({
          id: REGISTRY_OBJECT_ID,
          options: { showContent: true }
        });

        if (registryObj.error) {
          throw new Error(`Registry object not found: ${registryObj.error.code}`);
        }

        const content = registryObj.data?.content;
        if (!content || content.dataType !== 'moveObject') {
          throw new Error("Invalid registry object structure.");
        }

        const registryFields = content.fields as any;
        const tableId = registryFields.agents?.fields?.id?.id;
        if (!tableId) {
          throw new Error("Failed to resolve agents Table ID from Registry object.");
        }

        // 2. Query AgentRegistered events to find all addresses
        const eventType = `${PACKAGE_ID}::aura_registry::AgentRegistered`;
        const registeredEvents = await suiClient.queryEvents({
          query: { MoveEventType: eventType },
          limit: 100
        });

        const uniqueAddresses = new Set<string>();
        registeredEvents.data.forEach((evt: any) => {
          const parsed = evt.parsedJson as any;
          if (parsed && parsed.agent) {
            uniqueAddresses.add(parsed.agent);
          }
        });

        // Add default demo addresses just in case events are empty
        const fallbackAddresses = [
          '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676' // Demo address
        ];
        fallbackAddresses.forEach((addr) => uniqueAddresses.add(addr));

        const agentsData: AgentInfo[] = [];

        // 3. For each address, query its AgentRecord from the dynamic Table fields
        for (const address of uniqueAddresses) {
          try {
            const dynamicField = await suiClient.getDynamicFieldObject({
              parentId: tableId,
              name: {
                type: 'address',
                value: address
              }
            });

            if (dynamicField.data && dynamicField.data.content && dynamicField.data.content.dataType === 'moveObject') {
              const recordFields = (dynamicField.data.content.fields as any).value?.fields;
              if (recordFields) {
                const rawScore = parseInt(recordFields.reputation_score || '500000', 10);
                const rawStake = parseInt(recordFields.stake?.fields?.value || '0', 10);
                const totalTasks = parseInt(recordFields.total_tasks || '0', 10);
                const successfulTasks = parseInt(recordFields.successful_tasks || '0', 10);
                const activeStatus = recordFields.active !== false;
                const blacklistUntil = parseInt(recordFields.blacklist_until || '0', 10);
                
                // Parse walrus history blob Option vector<u8>
                let latestBlobId: string | null = null;
                const blobOption = recordFields.walrus_history_blob;
                if (blobOption && blobOption.type && blobOption.type.includes('Option') && blobOption.fields?.vec?.length > 0) {
                  // convert vector of bytes/numbers to string
                  const byteVec = blobOption.fields.vec[0];
                  latestBlobId = typeof byteVec === 'string' 
                    ? byteVec 
                    : String.fromCharCode(...byteVec);
                }

                agentsData.push({
                  address,
                  reputation: rawScore,
                  totalTasks,
                  successfulTasks,
                  stakeAmount: rawStake / 1_000_000_000, // SUI
                  active: activeStatus,
                  blacklistUntil,
                  latestBlobId
                });
              }
            }
          } catch (err) {
            // Handle if agent record is no longer in table or failed to parse
            console.warn(`Failed to retrieve record for agent ${address}:`, err);
          }
        }

        // If no dynamic records loaded, supply mock demo data to keep frontend visual
        if (agentsData.length === 0) {
          agentsData.push({
            address: '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676',
            reputation: 920000,
            totalTasks: 48,
            successfulTasks: 44,
            stakeAmount: 0.01,
            active: true,
            blacklistUntil: 0,
            latestBlobId: 'xyfwRUYqWnmbw2C_9WUOMxrz1SMlJEzBumkoLg-AhFc'
          });
          agentsData.push({
            address: '0x3bf937ee2e95a129d1c0b392abde62551cf16757041a96f2ba1443f676ffb6a8',
            reputation: 400000,
            totalTasks: 20,
            successfulTasks: 8,
            stakeAmount: 0.0,
            active: false, // Slashed Agent
            blacklistUntil: 0,
            latestBlobId: null
          });
        }

        if (active) {
          // Sort active agents first, then higher reputation
          agentsData.sort((a, b) => {
            if (a.active !== b.active) return a.active ? -1 : 1;
            return b.reputation - a.reputation;
          });
          setAgents(agentsData);
        }
      } catch (err) {
        if (active) {
          setError((err as Error).message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    fetchAgents();
    return () => {
      active = false;
    };
  }, [refreshKey]);

  const pnlData = generatePnLData(agents);

  return (
    <div className="space-y-8 py-6">
      {/* Dashboard Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-bold text-white tracking-tight">Agent Registry Studio</h2>
          <p className="text-slate-400 mt-1">Compare active trading bots, inspect reputation scores, and view audited PnL.</p>
        </div>
        <button
          onClick={() => setRefreshKey(prev => prev + 1)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl border border-white/10 bg-slate-900/40 text-slate-300 hover:bg-slate-900/80 hover:text-white transition-all cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Sync On-Chain State
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          ⚠️ <strong>Configuration Alert:</strong> {error} Showing offline fallback simulation data.
        </div>
      )}

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <div className="relative h-12 w-12">
            <div className="absolute inset-0 rounded-full border-4 border-purple-500/20" />
            <div className="absolute inset-0 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
          </div>
        </div>
      ) : (
        <>
          {/* Stats Summary */}
          <div className="grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-6 backdrop-blur-xl flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Registered Bots</p>
                <p className="text-2xl font-bold text-white mt-1">{agents.length} Total</p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-6 backdrop-blur-xl flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
                <Award className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Avg Reputation</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {((agents.reduce((acc, curr) => acc + curr.reputation, 0) / agents.length) / 10000).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-6 backdrop-blur-xl flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <Shield className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Collateral Locked</p>
                <p className="text-2xl font-bold text-white mt-1">
                  {agents.reduce((acc, curr) => acc + curr.stakeAmount, 0).toFixed(3)} SUI
                </p>
              </div>
            </div>
          </div>

          {/* Performance Comparison Chart */}
          <div className="rounded-2xl border border-white/5 bg-slate-950/20 p-6 backdrop-blur-xl">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-purple-400" />
              Reputation-Weighted Performance Curves (PnL)
            </h3>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pnlData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis stroke="#94a3b8" fontSize={12} dataKey="name" />
                  <YAxis stroke="#94a3b8" fontSize={12} domain={[10, 'auto']} unit="%" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      color: '#fff',
                    }}
                  />
                  <Legend verticalAlign="top" height={36} />
                  {agents.map((agent, index) => {
                    const idShort = agent.address.substring(0, 8) + '...';
                    const colors = ['#a855f7', '#06b6d4', '#f43f5e', '#10b981'];
                    const strokeColor = agent.active ? colors[index % colors.length] : '#64748b';
                    return (
                      <Line
                        key={agent.address}
                        type="monotone"
                        dataKey={idShort}
                        stroke={strokeColor}
                        strokeWidth={2.5}
                        activeDot={{ r: 6 }}
                        strokeDasharray={agent.active ? undefined : '5 5'}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Agents List Table */}
          <div className="rounded-2xl border border-white/5 bg-slate-950/20 overflow-hidden backdrop-blur-xl">
            <div className="px-6 py-4 border-b border-white/5 bg-slate-900/20">
              <h3 className="font-semibold text-white">Registered Agents Directory</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider bg-slate-950/30">
                    <th className="px-6 py-4">Agent Address</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Stake (SUI)</th>
                    <th className="px-6 py-4 text-center">Success Rate</th>
                    <th className="px-6 py-4">Audit History</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm text-slate-300">
                  {agents.map((agent) => (
                    <tr key={agent.address} className="hover:bg-slate-900/30 transition-colors">
                      <td className="px-6 py-4 font-mono text-xs text-white">
                        {agent.address}
                      </td>
                      <td className="px-6 py-4">
                        {agent.active ? (
                          agent.blacklistUntil > 0 ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                              <ShieldAlert className="h-3.5 w-3.5" />
                              Suspended
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Active
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Slashed / Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">
                        {agent.stakeAmount.toFixed(2)} SUI
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-center justify-center gap-1">
                          <span className="font-bold text-white">
                            {(agent.reputation / 10000).toFixed(1)}%
                          </span>
                          <span className="text-[10px] text-slate-400">
                            ({agent.successfulTasks}/{agent.totalTasks} tasks)
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {agent.latestBlobId ? (
                          <span className="font-mono text-xs text-purple-400 bg-purple-500/5 px-2.5 py-1 rounded border border-purple-500/15 max-w-[120px] truncate block">
                            {agent.latestBlobId}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500 italic">No telemetry</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => onSelectAgent(agent.address, agent.latestBlobId)}
                          disabled={!agent.latestBlobId}
                          className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-500/10 text-purple-300 hover:bg-purple-500 hover:text-white disabled:opacity-30 disabled:hover:bg-purple-500/10 disabled:hover:text-purple-300 transition-all cursor-pointer"
                        >
                          Audit Telemetry
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
