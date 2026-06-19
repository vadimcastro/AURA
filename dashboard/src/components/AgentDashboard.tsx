import React, { useEffect, useState } from 'react';
import { SuiClient } from '@mysten/sui/client';
import {
  Award, Shield, ShieldAlert, ShieldCheck,
  Users, RefreshCw, Settings, Terminal, Globe, Trophy,
  X, Plus, Play, Square
} from 'lucide-react';
import { AgentSettingsModal } from './AgentSettingsModal';

// ─── Environment config ─────────────────────────────────────────────────────────────────
const PACKAGE_ID        = import.meta.env.VITE_AURA_PACKAGE_ID  || '';
const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '';
const SUI_RPC_URL       = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

// Instantiate once at module level — SuiClient is safe as a singleton.
const suiClient = new SuiClient({ url: SUI_RPC_URL });

// ─── Types ───────────────────────────────────────────────────────────────────
export interface AgentInfo {
  address:        string;
  name?:          string;
  /** Raw on-chain reputation score (0 – 1_000_000 = 0 – 100%) */
  reputation:     number;
  totalTasks:     number;
  successfulTasks: number;
  /** SUI, already divided by 1e9 */
  stakeAmount:    number;
  active:         boolean;
  blacklistUntil: number;
  latestBlobId:   string | null;
  registeredAt?:  number;
}

export interface LiveEvent {
  id: string;
  type: 'trade' | 'borrow' | 'slash' | 'register' | 'deregister';
  agent: string;
  message: string;
  timestamp: string;
  digest: string;
  isMocked: boolean;
  blobId?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Convert raw on-chain reputation score (0 – 1_000_000) to a percentage (0 – 100).
 * The contract stores reputation as 0-to-1_000_000 where 1_000_000 = 100%.
 */
const reputationPct = (raw: number) => (raw / 1_000_000) * 100;



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



export const AgentDashboard: React.FC<AgentDashboardProps> = ({ onSelectAgent }) => {
  const [agents, setAgents]       = useState<AgentInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [settingsAgent, setSettingsAgent] = useState<AgentInfo | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  // Onboarding Dock States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDeposit, setNewAgentDeposit] = useState('25');
  const [newAgentStrategyMode, setNewAgentStrategyMode] = useState<'preset' | 'copy'>('preset');
  const [newAgentRiskLevel, setNewAgentRiskLevel] = useState<number>(50);
  const [newAgentCopyTarget, setNewAgentCopyTarget] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  const [localAgents, setLocalAgents] = useState<AgentInfo[]>([]);
  const [activeLoops, setActiveLoops] = useState<Record<string, boolean>>({});
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const allAgents = [...localAgents, ...agents];

  // Helper to handle deploying a mock agent
  const handleDeployAgent = () => {
    if (!newAgentName.trim()) return;
    setIsDeploying(true);

    setTimeout(() => {
      // Create a new mock agent address
      const randomHex = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
      const mockAddr = `0x${randomHex}96f2ba1443f676ffb6a8`;
      const depositVal = parseFloat(newAgentDeposit) || 25;

      const newAgent: AgentInfo = {
        address: mockAddr,
        name: newAgentName.trim(),
        reputation: 1000000, // 100.0% starting rep
        totalTasks: 0,
        successfulTasks: 0,
        stakeAmount: 0.1, // 0.1 SUI gas / stake
        active: true,
        blacklistUntil: 0,
        latestBlobId: 'mock-walrus-telemetry-fresh',
        registeredAt: Date.now(),
      };

      setLocalAgents((prev) => [newAgent, ...prev]);

      // Add registration trace events to the log
      const registerEv: LiveEvent = {
        id: `register-tx-${Date.now()}-1`,
        type: 'register',
        agent: mockAddr,
        message: `Agent registered on-chain with 0.1 SUI collateral`,
        timestamp: new Date().toISOString(),
        digest: '0x' + Math.random().toString(16).substring(2, 10) + '... (Mock)',
        isMocked: true,
      };

      const policyEv: LiveEvent = {
        id: `register-tx-${Date.now()}-2`,
        type: 'register',
        agent: mockAddr,
        message: `Policy created: budget limit set to ${depositVal.toFixed(2)} dUSDC`,
        timestamp: new Date().toISOString(),
        digest: '0x' + Math.random().toString(16).substring(2, 10) + '... (Mock)',
        isMocked: true,
      };

      setLiveEvents((prev) => [policyEv, registerEv, ...prev]);
      
      // Auto toggle the execution loop
      setActiveLoops(prev => ({ ...prev, [mockAddr]: true }));

      setIsDeploying(false);
      setShowOnboarding(false);
      setNewAgentName('');
      setNewAgentDeposit('25');
      setNewAgentCopyTarget('');

      // Scroll to Agents table
      setTimeout(() => {
        document.getElementById('agents-table-title')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
    }, 1500);
  };

  const handleToggleLoop = (addr: string) => {
    setActiveLoops(prev => ({ ...prev, [addr]: !prev[addr] }));
  };

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
        const tableId = (registryObj.data?.content as any)?.fields?.agents?.fields?.id?.id;
        if (!tableId) throw new Error('Could not parse agents Table ID from Registry object.');

        // 1.5 Fetch AgentRegistered events to find registration timestamps
        const regEvents = await suiClient.queryEvents({
          query: { MoveEventType: `${PACKAGE_ID}::aura_registry::AgentRegistered` },
          limit: 50,
          order: 'descending',
        });
        const registrationTimes = new Map<string, number>();
        for (const ev of regEvents.data) {
          const agent = (ev.parsedJson as any)?.agent;
          if (agent) {
            registrationTimes.set(agent.toLowerCase(), Number(ev.timestampMs));
          }
        }

        // 2. Paginate through dynamic fields to get all agent addresses
        let hasNextPage = true;
        let cursor: string | null = null;
        const uniqueAddresses = new Set<string>();

        while (hasNextPage) {
          const dfPage = await suiClient.getDynamicFields({
            parentId: tableId,
            cursor,
            limit: 50, // For demo purposes
          });
          for (const df of dfPage.data) {
            if (df.name.type === 'address') {
              uniqueAddresses.add(df.name.value as string);
            }
          }
          hasNextPage = dfPage.hasNextPage;
          cursor = dfPage.nextCursor;
        }

        // Pre-fill with Owner as an active "Agent" for the demo if empty
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
            const stakeRaw       = parseInt(String(rf.stake ?? '0'), 10);
            const totalTasks     = parseInt(String(rf.total_tasks ?? '0'), 10);
            const successfulTasks = parseInt(String(rf.successful_tasks ?? '0'), 10);
            const active         = rf.active !== false;
            const blacklistUntil = parseInt(String(rf.blacklist_until ?? '0'), 10);

            // Decode walrus_history_blob: Option<vector<u8>>
            let latestBlobId: string | null = null;
            const blobRaw = rf.walrus_history_blob;
            
            if (blobRaw) {
              if (Array.isArray(blobRaw)) {
                // If the SDK flattens it into an array of numbers
                latestBlobId = String.fromCharCode(...(blobRaw as number[]));
              } else if (typeof blobRaw === 'string') {
                latestBlobId = blobRaw;
              } else {
                // Older struct format fallback
                const blobStruct = blobRaw as any;
                if (blobStruct.type?.includes('Option') && Array.isArray(blobStruct.fields?.vec) && blobStruct.fields.vec.length > 0) {
                  const byteVec = blobStruct.fields.vec[0];
                  latestBlobId = typeof byteVec === 'string'
                    ? byteVec
                    : String.fromCharCode(...(byteVec as number[]));
                }
              }
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
              registeredAt: registrationTimes.get(address.toLowerCase()),
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
              name: 'overflower.sui',
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
              name: 'aura-prime.sui',
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
          // Filter out agents without telemetry to preserve UX
          const filteredAgents = agentsData.filter(a => a.latestBlobId !== null);
          
          // Sort: new agents (registered in last 1 hour) first, then active first, then by descending reputation, then by descending totalTasks
          filteredAgents.sort((a, b) => {
            const aNew = a.registeredAt ? (Date.now() - a.registeredAt < 3600000) : false;
            const bNew = b.registeredAt ? (Date.now() - b.registeredAt < 3600000) : false;
            if (aNew !== bNew) return aNew ? -1 : 1;
            if (a.active !== b.active) return a.active ? -1 : 1;
            if (b.reputation !== a.reputation) return b.reputation - a.reputation;
            return b.totalTasks - a.totalTasks;
          });
          setAgents(filteredAgents);
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

  useEffect(() => {
    const fetchOnChainEvents = async () => {
      try {
        if (!PACKAGE_ID) return [];
        
        // Fetch events in parallel for both modules (since Sui doesn't support 'Any' fullnode filter queries)
        const [registryEvents, policyEvents] = await Promise.all([
          suiClient.queryEvents({
            query: { MoveModule: { package: PACKAGE_ID, module: 'aura_registry' } },
            limit: 15,
            order: 'descending',
          }),
          suiClient.queryEvents({
            query: { MoveModule: { package: PACKAGE_ID, module: 'agent_wallet_policy' } },
            limit: 15,
            order: 'descending',
          }),
        ]);

        const combined = [...registryEvents.data, ...policyEvents.data];
        // Sort descending by timestampMs
        combined.sort((a, b) => Number(b.timestampMs) - Number(a.timestampMs));

        return combined.map((ev) => {
          const typeStr = ev.type;
          let type: 'trade' | 'borrow' | 'slash' | 'register' | 'deregister' = 'trade';
          let message = 'On-chain event recorded';
          const agentAddr = (ev.parsedJson as any)?.agent || (ev.parsedJson as any)?.owner || ev.sender;
          
          if (typeStr.includes('AgentRegistered')) {
            type = 'register';
            const stake = (ev.parsedJson as any)?.stake_amount;
            message = `Agent registered with ${stake ? stake / 1e9 : 0.01} SUI stake`;
          } else if (typeStr.includes('TaskRecorded')) {
            type = 'trade';
            const success = (ev.parsedJson as any)?.success;
            const rep = (ev.parsedJson as any)?.reputation_score;
            message = `Task completed: ${success ? 'SUCCESS' : 'FAILED'} (Reputation: ${rep ? (rep / 10000).toFixed(1) : 50}%)`;
          } else if (typeStr.includes('WalrusHistoryUpdated')) {
            type = 'trade';
            const vec = (ev.parsedJson as any)?.blob_id;
            const blobId = Array.isArray(vec) ? String.fromCharCode(...vec) : String(vec);
            message = `Audit log committed. Blob ID: ${blobId.substring(0, 15)}...`;
          } else if (typeStr.includes('AgentSlashed')) {
            type = 'slash';
            const amt = (ev.parsedJson as any)?.slashed_amount;
            message = `Agent slashed by admin! Seized ${amt ? amt / 1e9 : 0} SUI`;
          } else if (typeStr.includes('AgentBlacklisted')) {
            type = 'slash';
            const epoch = (ev.parsedJson as any)?.until_epoch;
            message = `Agent blacklisted/suspended until epoch ${epoch}`;
          } else if (typeStr.includes('AgentDeregistered')) {
            type = 'deregister';
            const ret = (ev.parsedJson as any)?.stake_returned;
            message = `Agent deregistered and reclaimed ${ret ? ret / 1e9 : 0} SUI`;
          } else if (typeStr.includes('PolicyCreated')) {
            type = 'register';
            const budget = (ev.parsedJson as any)?.budget_limit;
            message = `Policy created with budget ${budget ? budget / 1e6 : 0} dUSDC`;
          } else if (typeStr.includes('Deposited')) {
            type = 'register';
            const amt = (ev.parsedJson as any)?.amount;
            message = `Deposited ${amt ? amt / 1e6 : 0} dUSDC budget`;
          } else if (typeStr.includes('BorrowedForTrade')) {
            type = 'borrow';
            const amt = (ev.parsedJson as any)?.amount;
            message = `Agent borrowed ${amt ? amt / 1e6 : 0} dUSDC for trade`;
          } else if (typeStr.includes('TradeCompleted')) {
            type = 'trade';
            const refund = (ev.parsedJson as any)?.amount_returned;
            message = `Trade returned ${refund ? refund / 1e6 : 0} dUSDC to policy`;
          } else if (typeStr.includes('PolicyRevoked')) {
            type = 'deregister';
            const refund = (ev.parsedJson as any)?.refund_amount;
            message = `Policy revoked; reclaimed ${refund ? refund / 1e6 : 0} dUSDC`;
          }
          
          return {
            id: ev.id.txDigest + '-' + ev.id.eventSeq,
            type,
            agent: agentAddr,
            message,
            timestamp: new Date(Number(ev.timestampMs)).toISOString(),
            digest: ev.id.txDigest,
            isMocked: false,
          } as LiveEvent;
        });
      } catch (err) {
        console.warn('Could not query on-chain events:', err);
        return [];
      }
    };

    const loadInitialEvents = async () => {
      const ocvs = await fetchOnChainEvents();
      setLiveEvents(ocvs);
    };

    loadInitialEvents();

    const interval = setInterval(async () => {
      const ocvs = await fetchOnChainEvents();
      setLiveEvents((prev) => {
        const existingDigests = new Set(prev.map(e => e.digest));
        const newEvents = ocvs.filter(e => !existingDigests.has(e.digest));
        
        if (newEvents.length > 0) {
          return [...newEvents, ...prev].slice(0, 50);
        }
        return prev;
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [agents, refreshKey]);

  // Browser-based simulation loop for running agents
  useEffect(() => {
    const activeAddrs = Object.keys(activeLoops).filter(k => activeLoops[k]);
    if (activeAddrs.length === 0) return;

    const interval = setInterval(() => {
      activeAddrs.forEach(addr => {
        const ag = allAgents.find(a => a.address === addr);
        if (!ag) return;

        const isSuccess = Math.random() > 0.15; // 85% success
        const decision = Math.random() > 0.5 ? "Place Up (Call Option)" : "Mint Range 68k-72k";
        const tradeAmount = 10_000_000;
        const refundAmount = isSuccess ? 10_500_000 : 9_500_000;
        const pnl = refundAmount - tradeAmount;
        
        // Update local agents stats
        setLocalAgents(prev => prev.map(a => {
          if (a.address === addr) {
            const nextTasks = a.totalTasks + 1;
            const nextSuccess = a.successfulTasks + (isSuccess ? 1 : 0);
            return {
              ...a,
              totalTasks: nextTasks,
              successfulTasks: nextSuccess,
              reputation: Math.min(1000000, Math.max(0, Math.round((nextSuccess / nextTasks) * 1000000)))
            };
          }
          return a;
        }));

        // Add telemetry log
        const blobId = 'mock-walrus-telemetry-' + Math.random().toString(36).substring(2, 10);
        const newEv: LiveEvent = {
          id: 'mock-tx-' + Date.now() + '-' + Math.random(),
          type: 'trade',
          agent: addr,
          message: `Simulated trade cycle: ${decision} returned ${refundAmount / 1e6} dUSDC (${pnl >= 0 ? '+' : ''}${pnl / 1e6} dUSDC PnL)`,
          timestamp: new Date().toISOString(),
          digest: '0x' + Math.random().toString(16).substring(2, 12).toUpperCase() + ' (Sim)',
          isMocked: true,
          blobId
        };
        
        setLiveEvents(prev => [newEv, ...prev].slice(0, 50));
      });
    }, 12000);

    return () => clearInterval(interval);
  }, [activeLoops, localAgents]);

  // Derived stats
  const totalAgents  = allAgents.length;
  const activeAgents = allAgents.filter(a => a.active).length;
  const avgRepPct    = totalAgents > 0
    ? allAgents.reduce((acc, a) => acc + reputationPct(a.reputation), 0) / totalAgents
    : 0;
  const totalStake   = allAgents.reduce((acc, a) => acc + a.stakeAmount, 0);

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
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowOnboarding(prev => !prev)}
            className="flex items-center gap-2 px-4 py-2 text-[12px] font-bold rounded-xl transition-all cursor-pointer text-white bg-[var(--color-brand)] shadow-sm hover:opacity-90"
          >
            <Plus className="h-3.5 w-3.5" /> Register Agent
          </button>
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
      </div>

      {/* Onboarding Panel Form */}
      {showOnboarding && (
        <div 
          className="p-6 rounded-2xl border transition-all duration-300 ease-in-out shadow-lg"
          style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
        >
          <div className="flex justify-between items-center mb-5 pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="text-[14px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>Register Copy-Trading Agent</h3>
            <button onClick={() => setShowOnboarding(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer">
              <X className="h-4 w-4" />
            </button>
          </div>
          
          <div className="grid gap-6 md:grid-cols-2">
            {/* Left: Base Parameters */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Agent Name / SuiNS</label>
                <input 
                  type="text" 
                  value={newAgentName}
                  onChange={e => setNewAgentName(e.target.value)}
                  placeholder="e.g. overflower.sui"
                  className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
              
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Initial Funding (dUSDC)</label>
                <input 
                  type="number" 
                  value={newAgentDeposit}
                  onChange={e => setNewAgentDeposit(e.target.value)}
                  placeholder="25.00"
                  className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none"
                  style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                />
              </div>
            </div>

            {/* Right: Strategy Switcher & Options */}
            <div className="space-y-4 md:border-l md:pl-6" style={{ borderColor: 'var(--color-border)' }}>
              <div className="space-y-2">
                <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Strategy Selection</label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setNewAgentStrategyMode('preset')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${newAgentStrategyMode === 'preset' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    Strategy Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewAgentStrategyMode('copy')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${newAgentStrategyMode === 'copy' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    Copy Profile
                  </button>
                </div>
              </div>

              {newAgentStrategyMode === 'preset' ? (
                <div className="space-y-3 pt-2">
                  <div className="flex justify-between items-center text-[12px] font-semibold">
                    <span style={{ color: 'var(--color-text-secondary)' }}>Risk Setting:</span>
                    <span className="font-mono px-2 py-0.5 rounded border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                      {newAgentRiskLevel === 25 ? 'Conservative' : newAgentRiskLevel === 50 ? 'Balanced' : 'Aggressive'}
                    </span>
                  </div>
                  <input 
                    type="range" 
                    min="25" 
                    max="75" 
                    step="25"
                    value={newAgentRiskLevel}
                    onChange={e => setNewAgentRiskLevel(parseInt(e.target.value))}
                    className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                    style={{ background: 'var(--color-border)' }}
                  />
                  <div className="flex justify-between text-[9px] font-bold uppercase" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Conservative</span>
                    <span>Balanced</span>
                    <span>Aggressive</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-text-muted)' }}>Select Target Agent to Copy</label>
                    <select
                      value={newAgentCopyTarget}
                      onChange={e => setNewAgentCopyTarget(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg text-[12px] outline-none"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="">-- Choose from top rank --</option>
                      {agents.map((a) => {
                        const successRateStr = a.totalTasks > 0
                          ? `${((a.successfulTasks / a.totalTasks) * 100).toFixed(0)}% (${a.successfulTasks}/${a.totalTasks})`
                          : '0% (0/0)';
                        return (
                          <option key={a.address} value={a.address}>
                            {a.name || a.address.substring(0, 12)}… ({reputationPct(a.reputation).toFixed(0)}% Rep · {successRateStr} Trades)
                          </option>
                        );
                      })}
                    </select>
                  </div>
                  
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold uppercase" style={{ color: 'var(--color-text-muted)' }}>Or Paste Custom Profile / SuiNS</label>
                    <input 
                      type="text" 
                      value={newAgentCopyTarget}
                      onChange={e => setNewAgentCopyTarget(e.target.value)}
                      placeholder="Sui address or name.sui"
                      className="w-full px-3 py-1.5 rounded-lg text-[12px] outline-none"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
            <button 
              onClick={() => setShowOnboarding(false)} 
              disabled={isDeploying}
              className="px-4 py-2 text-[12px] font-semibold transition-colors cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-secondary)')}
            >
              Cancel
            </button>
            <button 
              onClick={handleDeployAgent}
              disabled={isDeploying}
              className="px-5 py-2 text-[12px] font-bold rounded-lg text-white bg-[var(--color-brand)] transition-all cursor-pointer hover:opacity-90 disabled:opacity-50"
            >
              {isDeploying ? 'Deploying...' : 'Deploy Agent'}
            </button>
          </div>
        </div>
      )}

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

          {/* Live grid section */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Live Trade Tracker */}
            <div
              className="lg:col-span-2 rounded-2xl p-6 flex flex-col justify-between"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', minHeight: '380px' }}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
                    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      Live Activity & Telemetry Feed
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                      Live Monitoring Active
                    </span>
                  </div>
                </div>
                
                {/* Event Logs Container */}
                <div 
                  className="overflow-y-auto space-y-2.5 max-h-[280px] pr-1 scrollbar-thin"
                >
                  {liveEvents.length === 0 ? (
                    <div className="py-12 flex items-center justify-center text-[12px]" style={{ color: 'var(--color-text-muted)' }}>
                      Waiting for events...
                    </div>
                  ) : (
                    liveEvents.map((ev) => (
                      <div 
                        key={ev.id}
                        className="p-3 rounded-xl border flex items-start justify-between gap-3 text-[12px] transition-all"
                        style={{ 
                          background: 'var(--color-surface-2)', 
                          borderColor: 'var(--color-border-soft)'
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 font-mono text-[9px] uppercase px-1.5 py-0.5 rounded font-bold shrink-0" style={{
                            background: 
                              ev.type === 'slash' ? 'var(--color-danger-bg)' : 
                              ev.type === 'borrow' ? 'var(--color-brand-light)' : 
                              (ev.type === 'register' || ev.type === 'deregister') ? 'var(--color-info-bg)' : 
                              'var(--color-success-bg)',
                            color: 
                              ev.type === 'slash' ? 'var(--color-danger)' : 
                              ev.type === 'borrow' ? 'var(--color-brand)' : 
                              (ev.type === 'register' || ev.type === 'deregister') ? 'var(--color-info)' : 
                              'var(--color-success)'
                          }}>
                            {ev.type}
                          </div>
                          <div>
                            <p className="font-semibold text-[12px]" style={{ color: 'var(--color-text-primary)' }}>
                              {ev.message}
                            </p>
                            <div className="flex items-center gap-2 mt-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                              <span className="font-mono">{ev.agent.substring(0, 8)}…{ev.agent.slice(-4)}</span>
                              <span>·</span>
                              <span>{new Date(ev.timestamp).toLocaleTimeString()}</span>
                              {ev.digest && (
                                <>
                                  <span>·</span>
                                  <a 
                                    href={`https://suiscan.xyz/testnet/tx/${ev.digest}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="hover:underline font-mono"
                                    style={{ color: 'var(--color-brand)' }}
                                  >
                                    {ev.digest.substring(0, 10)}…
                                  </a>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          {ev.isMocked ? (
                            <span className="inline-flex items-center text-[9px] font-semibold px-1.5 py-0.5 rounded border" style={{ color: 'var(--color-text-muted)', borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}>
                              SIMULATED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                              <Globe className="h-2.5 w-2.5" /> ON-CHAIN
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Top Performing Agents */}
            <div
              className="rounded-2xl p-6 flex flex-col justify-between"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Trophy className="h-4 w-4" style={{ color: '#f59e0b' }} />
                  <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                    Top Performing Agents
                  </h3>
                </div>
                
                <div className="space-y-4">
                  {allAgents.slice(0, 3).map((agent, index) => {
                    const repPercent = reputationPct(agent.reputation);
                    const isWinner = index === 0;
                    return (
                      <div 
                        key={agent.address} 
                        className="flex items-center justify-between p-3 rounded-xl border transition-all hover:scale-[1.01]"
                        style={{ 
                          background: isWinner ? 'rgba(245, 158, 11, 0.04)' : 'var(--color-surface)', 
                          borderColor: isWinner ? 'rgba(245, 158, 11, 0.2)' : 'var(--color-border-soft)'
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full flex items-center justify-center font-bold text-[13px] border" style={{
                            background: index === 0 ? '#fbf2db' : index === 1 ? '#eef0f2' : '#fcf5eb',
                            color: index === 0 ? '#b45309' : index === 1 ? '#4b5563' : '#b45309',
                            borderColor: index === 0 ? '#f59e0b' : index === 1 ? '#d1d5db' : '#f59e0b'
                          }}>
                            #{index + 1}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-mono text-[11px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
                                {agent.address.substring(0, 8)}…{agent.address.slice(-4)}
                              </p>
                              {agent.registeredAt && (Date.now() - agent.registeredAt < 3600000) && (
                                <span className="px-1.5 py-0.2 rounded text-[7px] font-bold uppercase bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe] shrink-0">
                                  New
                                </span>
                              )}
                            </div>
                            <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                              {agent.successfulTasks} / {agent.totalTasks} successful
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <span className="text-[13px] font-bold" style={{
                            color: repPercent >= 70 ? 'var(--color-success)' : repPercent >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'
                          }}>
                            {repPercent.toFixed(1)}%
                          </span>
                          <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: 'var(--color-text-muted)' }}>Reputation</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              <div className="pt-4 border-t mt-4 border-dashed" style={{ borderColor: 'var(--color-border)' }}>
                <p className="text-[11px] text-center" style={{ color: 'var(--color-text-muted)' }}>
                  Stakes are automatically locked and delegated in AURA registry.
                </p>
              </div>
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
              <h3 className="text-[14px] font-semibold" style={{ color: 'var(--color-text-primary)' }} id="agents-table-title">
                Registered Agents Directory
              </h3>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                {allAgents.length} agent{allAgents.length !== 1 ? 's' : ''}
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
                  {(isExpanded ? allAgents : allAgents.slice(0, 12)).map((agent) => {
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
                        <td className="px-5 py-3.5" style={{ color: 'var(--color-text-primary)' }}>
                          <div className="flex flex-col gap-0.5 select-none">
                            <span 
                              onClick={() => copyToClipboard(agent.address)}
                              className="cursor-pointer font-semibold transition-colors flex items-center gap-1.5"
                              title="Click to copy full address"
                            >
                              {agent.name ? (
                                <span className="text-[13px] font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-brand)]">{agent.name}</span>
                              ) : (
                                <span className="font-mono text-[11px] hover:text-[var(--color-brand)]">{agent.address.substring(0, 14)}…{agent.address.slice(-6)}</span>
                              )}
                              {agent.registeredAt && (Date.now() - agent.registeredAt < 3600000) && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-[#dbeafe] text-[#1e40af] border border-[#bfdbfe] shrink-0">
                                  New
                                </span>
                              )}
                              {copiedAddress === agent.address && (
                                <span className="px-1 py-0.5 rounded text-[8px] font-bold uppercase bg-[#ecfdf3] text-[#065f46] border border-[#a7f3d0] shrink-0 animate-pulse">
                                  Copied!
                                </span>
                              )}
                            </span>
                            {agent.name && (
                              <span 
                                onClick={() => copyToClipboard(agent.address)}
                                className="font-mono text-[10px] text-[var(--color-text-muted)] cursor-pointer hover:text-[var(--color-brand)] transition-colors"
                                title="Click to copy full address"
                              >
                                {agent.address.substring(0, 12)}…{agent.address.slice(-6)}
                              </span>
                            )}
                          </div>
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
                          <div className="flex items-center justify-end gap-2">
                            <button
                              id={`btn-audit-${agent.address.substring(2, 8)}`}
                              onClick={() => onSelectAgent(agent.address, agent.latestBlobId)}
                              disabled={!agent.latestBlobId}
                              className="w-[125px] justify-center px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
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
                            <button
                              onClick={() => setSettingsAgent(agent)}
                              className="w-[105px] justify-center px-3 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1.5 transition-all cursor-pointer border"
                              style={{
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-secondary)',
                                borderColor: 'var(--color-border)'
                              }}
                              onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
                                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
                              }}
                              onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)';
                                (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
                              }}
                            >
                              <Settings className="h-3.5 w-3.5" /> Configure
                            </button>
                            <button
                              onClick={() => handleToggleLoop(agent.address)}
                              className={`w-[105px] justify-center px-3 py-1.5 rounded-lg text-[12px] flex items-center gap-1.5 transition-all cursor-pointer border ${
                                activeLoops[agent.address] 
                                  ? 'font-bold text-white bg-[#12b76a] border-[#12b76a] shadow-md shadow-emerald-500/20 hover:opacity-95' 
                                  : 'font-semibold text-[var(--color-brand)] bg-[rgba(79,110,247,0.04)] border-[var(--color-brand)]/20 hover:bg-[var(--color-brand)] hover:text-white hover:border-[var(--color-brand)]'
                              }`}
                            >
                              {activeLoops[agent.address] ? (
                                <>
                                  <Square className="h-3 w-3 fill-current text-white animate-pulse" /> Active
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3 fill-current" /> Run Loop
                                </>
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {allAgents.length > 12 && (
                <div
                  className="px-6 py-3 border-t flex justify-center"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                >
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-[12px] font-semibold text-[var(--color-brand)] hover:underline"
                  >
                    {isExpanded ? 'Show fewer agents' : `Show all ${allAgents.length} agents`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {settingsAgent && (
        <AgentSettingsModal
          agentAddress={settingsAgent.address}
          currentStake={settingsAgent.stakeAmount}
          isActive={settingsAgent.active}
          availableAgents={allAgents.map(a => {
            const successRateStr = a.totalTasks > 0
              ? `${((a.successfulTasks / a.totalTasks) * 100).toFixed(0)}% (${a.successfulTasks}/${a.totalTasks})`
              : '0% (0/0)';
            return {
              address: a.address,
              label: `${a.name || a.address.substring(0, 10) + '…'} (${reputationPct(a.reputation).toFixed(0)}% Rep · ${successRateStr} Trades)`
            };
          })}
          onClose={() => setSettingsAgent(null)}
        />
      )}
    </div>
  );
};
