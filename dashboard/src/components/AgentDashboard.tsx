import React, { useEffect, useState } from 'react';
import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import {
  Award, Shield, ShieldAlert, ShieldCheck,
  Users, RefreshCw, Settings, Terminal, Globe, Trophy,
  X, Plus, Play, Square, Zap, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { AgentSettingsModal } from './AgentSettingsModal';

// ─── Environment config ─────────────────────────────────────────────────────────────────
const PACKAGE_ID        = import.meta.env.VITE_AURA_PACKAGE_ID  || '';
const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '';
const SUI_RPC_URL       = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';

// Instantiate once at module level — SuiClient is safe as a singleton.
const suiClient = new SuiClient({ url: SUI_RPC_URL, network: 'testnet' });

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
  budget?:        number;
  strategyMode?:  'preset' | 'copy';
  riskLevel?:     number;
  copyTarget?:    string;
  totalPnl?:      number;
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

/**
 * Derives a dynamic PnL (dUSDC) based on successful/failed tasks + base seed reputation.
 */
const getAgentPnL = (agent: AgentInfo, daemonActiveAddress?: string | null): number => {
  if (agent.totalPnl !== undefined && agent.totalPnl !== 0) {
    return agent.totalPnl;
  }
  const tradePnl = (agent.successfulTasks * 0.5) - ((agent.totalTasks - agent.successfulTasks) * 0.5);
  if (daemonActiveAddress && agent.address.toLowerCase() === daemonActiveAddress.toLowerCase()) {
    return tradePnl;
  }
  const seed = parseInt(agent.address.substring(2, 8), 16) || 0;
  const initialPnl = agent.reputation > 0 ? (seed % 150) + 50.25 : 0;
  return tradePnl + initialPnl;
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
  activeSession?: {
    address: string;
    type: string;
    name: string;
    providerLabel: string;
  } | null;
  onTriggerStripeOnramp?: () => void;
}



export const AgentDashboard: React.FC<AgentDashboardProps> = ({ 
  onSelectAgent, 
  activeSession, 
  onTriggerStripeOnramp 
}) => {
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();
  const [agents, setAgents]       = useState<AgentInfo[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);

  // Auto-refresh on-chain agents list every 15 seconds to sync run loop updates dynamically
  useEffect(() => {
    const interval = setInterval(() => {
      setRefreshKey((k) => k + 1);
    }, 15000);
    return () => clearInterval(interval);
  }, []);
  const [settingsAgent, setSettingsAgent] = useState<AgentInfo | null>(null);
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

  // Daemon integration states for pure telemetry pnl overlay
  const [daemonActiveAddress, setDaemonActiveAddress] = useState<string | null>(null);
  const [daemonBalances, setDaemonBalances] = useState<{ sui: string; dUSDC: string } | null>(null);

  useEffect(() => {
    const daemonUrl = localStorage.getItem('aura_daemon_url') || import.meta.env.VITE_DAEMON_URL || 'http://localhost:3000';
    if (!daemonUrl) return;
    const checkDaemon = async () => {
      try {
        const res = await fetch(`${daemonUrl}/api/status`);
        if (res.ok) {
          const data = await res.json();
          if (data.ownerAddress) {
            setDaemonActiveAddress(data.ownerAddress);
          }
          if (data.ownerBalances) {
            setDaemonBalances(data.ownerBalances);
          }
        }
      } catch (e) {
        console.warn('Dashboard daemon sync error:', e);
      }
    };
    checkDaemon();
    const interval = setInterval(checkDaemon, 10000);
    return () => clearInterval(interval);
  }, []);

  // Onboarding Dock States
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentDeposit, setNewAgentDeposit] = useState('25');
  const [newAgentStrategyMode, setNewAgentStrategyMode] = useState<'preset' | 'copy'>('preset');
  const [newAgentRiskLevel, setNewAgentRiskLevel] = useState<number>(50);
  const [newAgentCopyTarget, setNewAgentCopyTarget] = useState('');
  const [isDeploying, setIsDeploying] = useState(false);

  const [localAgents, setLocalAgents] = useState<AgentInfo[]>([]);
  const [activeLoops, setActiveLoops] = useState<Record<string, {
    mode: 'continuous' | '1min' | '3min';
    timeLeft: number;
    nextTradeIn: number;
    intervalSec: number;
  }>>({});

  const [traces, setTraces] = useState<any[]>([]);
  const [traceIndex, setTraceIndex] = useState<number>(0);

  useEffect(() => {
    fetch('/deepbook_traces.json')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setTraces(data);
        }
      })
      .catch((err) => {
        console.warn('⚠️ Failed to load deepbook_traces.json in frontend:', err);
      });
  }, []);


  const [dropdownOpen, setDropdownOpen] = useState<string | null>(null);
  const [autoStartLoop, setAutoStartLoop] = useState(true);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);

  const copyToClipboard = (addr: string) => {
    navigator.clipboard.writeText(addr);
    setCopiedAddress(addr);
    setTimeout(() => setCopiedAddress(null), 1500);
  };

  const allAgents = [...localAgents, ...agents];

  // Handle deploying a live agent on-chain (if wallet is connected) or a mock agent (if zkLogin/guest)
  const handleDeployAgent = async () => {
    if (!newAgentName.trim()) return;
    setIsDeploying(true);

    const isWalletConnected = activeSession?.type === 'wallet';

    if (isWalletConnected) {
      try {
        console.log("📡 Registering agent live on-chain on Sui Testnet...");
        const tx = new Transaction();
        
        // 1. Split 0.01 SUI (10,000,000 Mist) from gas coin for agent collateral stake
        const [stakeCoin] = tx.splitCoins(tx.gas, [10_000_000]);
        
        // 2. Register agent in our on-chain registry
        tx.moveCall({
          target: `${PACKAGE_ID}::aura_registry::register_agent`,
          arguments: [
            tx.object(REGISTRY_OBJECT_ID),
            stakeCoin
          ]
        });

        // 3. Request wallet signature & execute on-chain
        const result = await signAndExecuteTransaction({
          transaction: tx,
        });

        console.log(`✅ On-chain agent registration succeeded. Digest: ${result.digest}`);

        // Add real transaction event log
        const registerEv: LiveEvent = {
          id: `register-tx-${Date.now()}-1`,
          type: 'register',
          agent: activeSession.address,
          message: `Agent registered live on-chain with 0.01 SUI collateral`,
          timestamp: new Date().toISOString(),
          digest: result.digest,
          isMocked: false,
        };

        setLiveEvents((prev) => [registerEv, ...prev]);
        setRefreshKey(k => k + 1); // Refresh directory to fetch the newly registered agent immediately
      } catch (err) {
        console.error("❌ On-chain agent registration failed:", err);
        alert(`On-chain registration failed: ${(err as Error).message}`);
      } finally {
        setIsDeploying(false);
        setShowOnboarding(false);
        setNewAgentName('');
        setNewAgentDeposit('25');
        setNewAgentCopyTarget('');
      }
    } else {
      // Fallback to simulated local mock agent for zkLogin or guest sessions (saves gas & UX hurdles)
      setTimeout(() => {
        const randomHex = Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
        const mockAddr = `0x${randomHex}96f2ba1443f676ffb6a8`;
        const depositVal = parseFloat(newAgentDeposit) || 25;

        const newAgent: AgentInfo = {
          address: mockAddr,
          name: newAgentName.trim(),
          reputation: 1000000,
          totalTasks: 0,
          successfulTasks: 0,
          stakeAmount: 0.01,
          active: true,
          blacklistUntil: 0,
          latestBlobId: 'mock-walrus-telemetry-fresh',
          registeredAt: Date.now(),
          budget: depositVal,
          strategyMode: newAgentStrategyMode,
          riskLevel: newAgentRiskLevel,
          copyTarget: newAgentCopyTarget || undefined,
          totalPnl: 0,
        };

        setLocalAgents((prev) => [newAgent, ...prev]);

        const registerEv: LiveEvent = {
          id: `register-tx-${Date.now()}-1`,
          type: 'register',
          agent: mockAddr,
          message: `Agent registered on-chain with 0.01 SUI collateral`,
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
        
        if (autoStartLoop) {
          setActiveLoops(prev => ({
            ...prev,
            [mockAddr]: {
              mode: 'continuous',
              timeLeft: Infinity,
              nextTradeIn: 10,
              intervalSec: 10,
            }
          }));
        }

        setIsDeploying(false);
        setShowOnboarding(false);
        setNewAgentName('');
        setNewAgentDeposit('25');
        setNewAgentCopyTarget('');

        setTimeout(() => {
          document.getElementById('agents-table-title')?.scrollIntoView({ behavior: 'smooth' });
        }, 300);
      }, 1500);
    }
  };

  const executeTradeCycleLocal = (addr: string, isManual: boolean = false, modeLabel?: string) => {
    // 1. Resolve agent configuration
    const agent = allAgents.find(a => a.address === addr);
    const strategyMode = agent?.strategyMode || 'preset';
    const riskLevel = agent?.riskLevel !== undefined ? agent.riskLevel : 50;

    // 2. Select deepbook trace
    let trace = traces[traceIndex % traces.length];
    if (!trace) {
      trace = {
        id: "trace-tx-fallback-" + Math.random().toString(36).substring(2, 6),
        tradeAmount: 10000000,
        lowerStrike: 68500,
        higherStrike: 71500,
        action: "MintRange",
        volatilityEstimate: 0.12
      };
    }
    // Update trace index
    setTraceIndex(prev => (prev + 1) % (traces.length || 1));

    // 3. Drive simulation based on settings and trace data
    let isSuccess = false;
    let decision = '';
    let tradeAmount = trace.tradeAmount || 10_000_000;
    let pnl = 0;

    if (strategyMode === 'copy') {
      // Copy trading: execute trace trade directly
      const strikeLabel = trace.lowerStrike && trace.higherStrike 
        ? `${(trace.lowerStrike / 1000).toFixed(1)}k-${(trace.higherStrike / 1000).toFixed(1)}k` 
        : '69k-71k';
      
      if (trace.action === 'PlaceUp') {
        decision = `Copy Target: Place Up (Call Option)`;
      } else if (trace.action === 'PlaceDown') {
        decision = `Copy Target: Place Down (Put Option)`;
      } else {
        decision = `Copy Target: Mint Range ${strikeLabel}`;
      }

      isSuccess = Math.random() > 0.15; // 85% standard success
      const pnlPct = isSuccess ? 0.07 : -0.05;
      pnl = Math.round(tradeAmount * pnlPct);
    } else {
      // Preset strategy: Conservative, Balanced, Aggressive based on risk slider
      if (riskLevel <= 33) {
        // Conservative
        const strikeDiff = (trace.higherStrike - trace.lowerStrike) || 4000;
        const targetLower = Math.round((trace.lowerStrike || 68000) - strikeDiff * 0.15);
        const targetRight = Math.round((trace.higherStrike || 72000) + strikeDiff * 0.15);
        decision = `Mint Safe Range ${(targetLower / 1000).toFixed(1)}k-${(targetRight / 1000).toFixed(1)}k`;
        
        isSuccess = Math.random() > 0.08; // 92% success rate
        const pnlPct = isSuccess ? 0.035 : -0.015; // lower payout, small premium loss
        pnl = Math.round(tradeAmount * pnlPct);
      } else if (riskLevel <= 66) {
        // Balanced
        const strikeLabel = trace.lowerStrike && trace.higherStrike 
          ? `${(trace.lowerStrike / 1000).toFixed(1)}k-${(trace.higherStrike / 1000).toFixed(1)}k` 
          : '68k-72k';
        decision = `Mint Range ${strikeLabel}`;
        
        isSuccess = Math.random() > 0.15; // 85% success rate
        const pnlPct = isSuccess ? 0.065 : -0.04;
        pnl = Math.round(tradeAmount * pnlPct);
      } else {
        // Aggressive
        const isCall = Math.random() > 0.5;
        decision = isCall ? `Place Up (Call Option)` : `Place Down (Put Option)`;
        
        isSuccess = Math.random() > 0.35; // 65% success rate
        const pnlPct = isSuccess ? 0.22 : -0.10; // high payout, high loss
        pnl = Math.round(tradeAmount * pnlPct);
      }
    }

    const refundAmount = tradeAmount + pnl;

    setLocalAgents(prev => {
      const exists = prev.some(a => a.address === addr);
      if (exists) {
        return prev.map(a => {
          if (a.address === addr) {
            const nextTasks = a.totalTasks + 1;
            const nextSuccess = a.successfulTasks + (isSuccess ? 1 : 0);
            const currentBudget = a.budget !== undefined ? a.budget : 25.0;
            const nextBudget = Math.max(0, currentBudget + (pnl / 1e6));
            return {
              ...a,
              totalTasks: nextTasks,
              successfulTasks: nextSuccess,
              reputation: Math.min(1000000, Math.max(0, Math.round((nextSuccess / nextTasks) * 1000000))),
              budget: nextBudget,
              totalPnl: (a.totalPnl || 0) + (pnl / 1e6),
            };
          }
          return a;
        });
      } else {
        const onChainAg = agents.find(a => a.address === addr);
        if (!onChainAg) return prev;
        const nextTasks = onChainAg.totalTasks + 1;
        const nextSuccess = onChainAg.successfulTasks + (isSuccess ? 1 : 0);
        const currentBudget = onChainAg.budget !== undefined ? onChainAg.budget : 25.0;
        const nextBudget = Math.max(0, currentBudget + (pnl / 1e6));
        const updated: AgentInfo = {
          ...onChainAg,
          totalTasks: nextTasks,
          successfulTasks: nextSuccess,
          reputation: Math.min(1000000, Math.max(0, Math.round((nextSuccess / nextTasks) * 1000000))),
          budget: nextBudget,
          totalPnl: (onChainAg.totalPnl || 0) + (pnl / 1e6),
        };
        return [updated, ...prev];
      }
    });

    const blobId = 'mock-walrus-telemetry-' + Math.random().toString(36).substring(2, 10);
    const label = isManual ? 'Manual' : (modeLabel ? `Sim - ${modeLabel}` : 'Sim');
    
    // Construct rich simulation status message showing trace alignment
    const message = isManual
      ? `Manual trade step executed [DeepBook Trace ${trace.id.substring(9, 14)}]: ${decision} returned ${(refundAmount / 1e6).toFixed(2)} dUSDC (${pnl >= 0 ? '+' : ''}${(pnl / 1e6).toFixed(2)} dUSDC PnL)`
      : `Simulated trade cycle [${modeLabel || 'Auto'} - Trace ${trace.id.substring(9, 14)}]: ${decision} returned ${(refundAmount / 1e6).toFixed(2)} dUSDC (${pnl >= 0 ? '+' : ''}${(pnl / 1e6).toFixed(2)} dUSDC PnL)`;

    const newEv: LiveEvent = {
      id: 'mock-tx-' + Date.now() + '-' + Math.random(),
      type: 'trade',
      agent: addr,
      message,
      timestamp: new Date().toISOString(),
      digest: '0x' + Math.random().toString(16).substring(2, 12).toUpperCase() + ` (${label})`,
      isMocked: true,
      blobId
    };

    setLiveEvents(prev => [newEv, ...prev].slice(0, 50));
  };

  const handleStepTrade = (addr: string) => {
    const ag = allAgents.find(a => a.address === addr);
    const currentBudget = ag?.budget !== undefined ? ag.budget : 25.0;
    if (currentBudget <= 0) {
      const errorEv: LiveEvent = {
        id: 'mock-tx-error-' + Date.now(),
        type: 'slash',
        agent: addr,
        message: `❌ Execution blocked: Agent policy wallet has run out of dUSDC budget (0.00 dUSDC left).`,
        timestamp: new Date().toISOString(),
        digest: '0xERROR-BUDGET',
        isMocked: true,
      };
      setLiveEvents(prev => [errorEv, ...prev].slice(0, 50));
      return;
    }
    executeTradeCycleLocal(addr, true);
  };

  useEffect(() => {
    let active = true;

    const fetchAgents = async () => {
      if (agents.length === 0) {
        setLoading(true);
      }
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

        // 3. Resolve each address from the dynamic Table fields and fetch names via SuiNS in parallel
        const agentsPromises = Array.from(uniqueAddresses).map(async (address) => {
          try {
            const [dynField, nameRes] = await Promise.all([
              suiClient.getDynamicFieldObject({
                parentId: tableId,
                name: { type: 'address', value: address },
              }),
              suiClient.resolveNameServiceNames({ address }).catch(() => null)
            ]);

            if (dynField.data?.content?.dataType !== 'moveObject') return null;

            const rf = (dynField.data.content.fields as Record<string, unknown> & {
              value?: { fields?: Record<string, unknown> };
            }).value?.fields;
            if (!rf) return null;

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
                latestBlobId = String.fromCharCode(...(blobRaw as number[]));
              } else if (typeof blobRaw === 'string') {
                latestBlobId = blobRaw;
              } else {
                const blobStruct = blobRaw as any;
                if (blobStruct.type?.includes('Option') && Array.isArray(blobStruct.fields?.vec) && blobStruct.fields.vec.length > 0) {
                  const byteVec = blobStruct.fields.vec[0];
                  latestBlobId = typeof byteVec === 'string'
                    ? byteVec
                    : String.fromCharCode(...(byteVec as number[]));
                }
              }
            }

            let name: string | undefined = undefined;
            if (nameRes && nameRes.data && nameRes.data.length > 0) {
              name = nameRes.data[0];
            }

            const agentInfo: AgentInfo = {
              address,
              name,
              reputation: rawScore,
              totalTasks,
              successfulTasks,
              stakeAmount: stakeRaw / 1_000_000_000,
              active,
              blacklistUntil,
              latestBlobId,
              registeredAt: registrationTimes.get(address.toLowerCase()),
              budget: 25.0,
            };
            return agentInfo;
          } catch (err) {
            console.warn(`Could not load record for agent ${address}:`, err);
            return null;
          }
        });

        const resolvedAgents = await Promise.all(agentsPromises);
        const agentsData: AgentInfo[] = resolvedAgents.filter((a): a is AgentInfo => a !== null);

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
              budget: 22.0,
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
              budget: 0.0,
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

  // Browser-based simulation loop for running agents (scheduled and continuous)
  useEffect(() => {
    const activeAddrs = Object.keys(activeLoops);
    if (activeAddrs.length === 0) return;

    const interval = setInterval(() => {
      setActiveLoops(prev => {
        const nextState = { ...prev };
        let stateChanged = false;

        Object.keys(nextState).forEach(addr => {
          const loop = nextState[addr];
          if (!loop) return;

          // Check if agent's budget is empty
          const currentAgent = allAgents.find(a => a.address === addr);
          const currentBudget = currentAgent?.budget !== undefined ? currentAgent.budget : 25.0;
          if (currentBudget <= 0) {
            delete nextState[addr];
            stateChanged = true;
            
            const outOfFundsEv: LiveEvent = {
              id: 'mock-schedule-halt-' + Date.now() + '-' + Math.random(),
              type: 'slash',
              agent: addr,
              message: `❌ Simulation halted: Agent has exhausted its policy wallet dUSDC budget (0.00 dUSDC left)! Please deposit funds to resume.`,
              timestamp: new Date().toISOString(),
              digest: '0x' + Math.random().toString(16).substring(2, 12).toUpperCase() + ' (OutFunds)',
              isMocked: true,
            };
            setLiveEvents(evs => [outOfFundsEv, ...evs].slice(0, 50));
            return;
          }

          // 1. Decrement timers
          const nextTimeLeft = loop.timeLeft === Infinity ? Infinity : loop.timeLeft - 1;
          const nextTradeIn = loop.nextTradeIn - 1;

          // Check if loop expired
          if (nextTimeLeft <= 0) {
            delete nextState[addr];
            stateChanged = true;
            
            const newEv: LiveEvent = {
              id: 'mock-schedule-end-' + Date.now() + '-' + Math.random(),
              type: 'deregister',
              agent: addr,
              message: `Scheduled simulation finished successfully (${loop.mode === '1min' ? '1 Minute' : '3 Minutes'} duration completed)`,
              timestamp: new Date().toISOString(),
              digest: '0x' + Math.random().toString(16).substring(2, 12).toUpperCase() + ' (Sched)',
              isMocked: true,
            };
            setLiveEvents(evs => [newEv, ...evs].slice(0, 50));
            return;
          }

          // 2. Trigger trade if it's time
          let finalTradeIn = nextTradeIn;
          if (nextTradeIn <= 0) {
            finalTradeIn = loop.intervalSec; // reset interval
            
            executeTradeCycleLocal(
              addr, 
              false, 
              loop.mode === 'continuous' ? 'Continuous' : loop.mode === '1min' ? '1 Min' : '3 Min'
            );
          }

          nextState[addr] = {
            ...loop,
            timeLeft: nextTimeLeft,
            nextTradeIn: finalTradeIn,
          };
          stateChanged = true;
        });

        return stateChanged ? nextState : prev;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeLoops, agents, localAgents, executeTradeCycleLocal]);

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
          {!activeSession ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <ShieldAlert className="h-10 w-10 text-amber-500 mb-4 animate-bounce" />
              <h4 className="text-[14px] font-bold uppercase tracking-wider text-[var(--color-text-primary)]">Account Connection Required</h4>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-2 max-w-sm leading-relaxed">
                You must connect a wallet or sign in with zkLogin to deploy strategy policies and register new agents on-chain. Use the button in the top right.
              </p>
              <button 
                onClick={() => setShowOnboarding(false)}
                className="mt-5 px-4 py-2 rounded-xl text-[12px] font-bold text-white bg-[var(--color-brand)] cursor-pointer hover:opacity-90 shadow-sm"
              >
                Got It
              </button>
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-5 pb-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <h3 className="text-[14px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>Register Copy-Trading Agent</h3>
                <button onClick={() => setShowOnboarding(false)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors cursor-pointer">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Show active session detail */}
              <div className="mb-4 p-3 rounded-xl border flex justify-between items-center bg-[var(--color-surface-2)] text-[12px] font-semibold" style={{ borderColor: 'var(--color-border)' }}>
                <span style={{ color: 'var(--color-text-secondary)' }}>Deployer Identity:</span>
                <span className="font-mono text-[var(--color-text-primary)]">{activeSession.name} ({activeSession.providerLabel})</span>
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
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 mt-1 text-[10px] font-medium text-[var(--color-text-muted)] leading-relaxed">
                  <span>Need capital?</span>
                  <a 
                    href="https://tally.so/r/Xx102L" 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-[var(--color-brand)] hover:underline cursor-pointer font-bold"
                  >
                    Request Testnet dUSDC Faucet
                  </a>
                  {onTriggerStripeOnramp && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={onTriggerStripeOnramp}
                        className="text-[var(--color-brand)] hover:underline cursor-pointer border-0 bg-transparent p-0 font-bold text-[10px]"
                      >
                        Fund with Stripe Onramp
                      </button>
                    </>
                  )}
                </div>
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

              {/* Supported Actions Description */}
              <div 
                className="p-3 rounded-xl border text-[10px] space-y-1.5 leading-relaxed" 
                style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
              >
                <span className="font-bold text-[var(--color-text-primary)] block uppercase tracking-wider text-[9px]">
                  Supported Actions & Strategy Mappings:
                </span>
                <ul className="list-disc pl-3.5 space-y-1 text-[var(--color-text-muted)]">
                  <li><strong>Conservative</strong>: Executing wide-spread option range minting (<code className="font-mono text-[var(--color-brand)]">MINT_RANGE</code>) on DeepBook V3.</li>
                  <li><strong>Balanced</strong>: Executing tighter options (<code className="font-mono text-[var(--color-brand)]">MINT_RANGE</code>) and Cetus pool liquidity provision (<code className="font-mono text-[var(--color-brand)]">LIQUIDITY</code>).</li>
                  <li><strong>Aggressive</strong>: Executing directional swaps (<code className="font-mono text-[var(--color-brand)]">SWAP</code>), high-yield lending collateral (<code className="font-mono text-[var(--color-brand)]">LEND</code>), and leveraged option plays.</li>
                </ul>
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
            <div className="flex items-center mr-auto gap-2 text-[12.5px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
              <input
                type="checkbox"
                id="auto-start-loop"
                checked={autoStartLoop}
                onChange={e => setAutoStartLoop(e.target.checked)}
                className="h-4.5 w-4.5 rounded accent-[var(--color-brand)] cursor-pointer"
              />
              <label htmlFor="auto-start-loop" className="cursor-pointer">Auto-run loop</label>
            </div>
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
          </>
          )}
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
                        
                        <div className="text-right flex flex-col justify-center items-end select-none">
                          <span className="text-[12px] font-bold" style={{
                            color: repPercent >= 70 ? 'var(--color-success)' : repPercent >= 40 ? 'var(--color-warning)' : 'var(--color-danger)'
                          }}>
                            {repPercent.toFixed(1)}% Rep
                          </span>
                          {(() => {
                             const pnlVal = getAgentPnL(agent, daemonActiveAddress);
                             const isPositive = pnlVal >= 0;
                            return (
                              <div className={`text-[12px] font-bold font-mono flex items-center gap-0.5 mt-0.5 ${isPositive ? 'text-[#12b76a]' : 'text-[#f04438]'}`}>
                                {isPositive ? <ArrowUpRight className="h-3.5 w-3.5 shrink-0" /> : <ArrowDownRight className="h-3.5 w-3.5 shrink-0" />}
                                <span>{isPositive ? '+' : ''}{pnlVal.toFixed(2)}</span>
                              </div>
                            );
                          })()}
                          <p className="text-[8px] uppercase tracking-wider font-bold" style={{ color: 'var(--color-text-muted)' }}>PnL (dUSDC)</p>
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
                    {['Agent Address', 'Status', 'Reputation', 'PnL (dUSDC)', 'Success Rate', 'Stake (SUI)', 'Telemetry', ''].map((h) => (
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
                              {daemonActiveAddress && agent.address.toLowerCase() === daemonActiveAddress.toLowerCase() && (
                                <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0 flex items-center gap-1 pulse-dot">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Live Node
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

                        <td className="px-5 py-3.5">
                          {(() => {
                            const pnlVal = getAgentPnL(agent, daemonActiveAddress);
                            const isPositive = pnlVal >= 0;
                            const isLiveDaemon = daemonActiveAddress && agent.address.toLowerCase() === daemonActiveAddress.toLowerCase();
                            const budgetVal = isLiveDaemon && daemonBalances
                              ? parseFloat(daemonBalances.dUSDC)
                              : (agent.budget !== undefined ? agent.budget : 25.0);
                            return (
                              <div className="flex items-center gap-1 select-none">
                                {isPositive ? (
                                  <ArrowUpRight className="h-4 w-4 text-[#12b76a] shrink-0" />
                                ) : (
                                  <ArrowDownRight className="h-4 w-4 text-[#f04438] shrink-0" />
                                )}
                                <div className="flex flex-col">
                                  <span className={`font-bold font-mono text-[12.5px] ${isPositive ? 'text-[#12b76a]' : 'text-[#f04438]'}`}>
                                    {isPositive ? '+' : ''}{pnlVal.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-[var(--color-text-muted)] font-medium">
                                    Budget: {budgetVal.toFixed(2)} dUSDC
                                  </span>
                                </div>
                              </div>
                            );
                          })()}
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
                          <div className="relative flex items-center justify-end gap-2">
                            <button
                              id={`btn-audit-${agent.address.substring(2, 8)}`}
                              onClick={() => onSelectAgent(agent.address, agent.latestBlobId)}
                              disabled={!agent.latestBlobId}
                              className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-all cursor-pointer border disabled:opacity-30 disabled:cursor-not-allowed"
                              style={{
                                background: 'var(--color-surface)',
                                color: 'var(--color-text-secondary)',
                                borderColor: 'var(--color-border)'
                              }}
                              onMouseEnter={e => {
                                if (!(e.currentTarget as HTMLButtonElement).disabled) {
                                  (e.currentTarget as HTMLElement).style.background = 'var(--color-surface-2)';
                                  (e.currentTarget as HTMLElement).style.color = 'var(--color-text-primary)';
                                }
                              }}
                              onMouseLeave={e => {
                                if (!(e.currentTarget as HTMLButtonElement).disabled) {
                                  (e.currentTarget as HTMLElement).style.background = 'var(--color-surface)';
                                  (e.currentTarget as HTMLElement).style.color = 'var(--color-text-secondary)';
                                }
                              }}
                            >
                              <Terminal className="h-3.5 w-3.5" /> Audit Log
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
                              onClick={() => {
                                if (activeLoops[agent.address]) {
                                  setActiveLoops(prev => {
                                    const next = { ...prev };
                                    delete next[agent.address];
                                    return next;
                                  });
                                } else {
                                  setDropdownOpen(dropdownOpen === agent.address ? null : agent.address);
                                }
                              }}
                              className={`w-[105px] justify-center px-3 py-1.5 rounded-lg text-[12px] flex items-center gap-1.5 transition-all cursor-pointer border ${
                                activeLoops[agent.address] 
                                  ? 'font-bold text-white bg-[#12b76a] border-[#12b76a] shadow-md shadow-emerald-500/20 hover:opacity-95' 
                                  : 'font-semibold text-[var(--color-brand)] bg-[rgba(79,110,247,0.04)] border-[var(--color-brand)]/20 hover:bg-[var(--color-brand)] hover:text-white hover:border-[var(--color-brand)]'
                              }`}
                            >
                              {activeLoops[agent.address] ? (
                                <>
                                  <Square className="h-3 w-3 fill-current text-white animate-pulse" />
                                  <span>
                                    {activeLoops[agent.address].timeLeft === Infinity 
                                      ? 'Active' 
                                      : `${Math.floor(activeLoops[agent.address].timeLeft / 60)}:${String(activeLoops[agent.address].timeLeft % 60).padStart(2, '0')}`
                                    }
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3 fill-current" /> Run Loop
                                </>
                              )}
                            </button>
                            {dropdownOpen === agent.address && (
                              <>
                                <div className="fixed inset-0 z-20" onClick={() => setDropdownOpen(null)} />
                                <div 
                                  className="absolute right-0 top-full mt-1.5 z-30 w-48 rounded-xl border shadow-xl flex flex-col p-1.5 gap-0.5"
                                  style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                                >
                                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] border-b pb-1.5 mb-1" style={{ borderColor: 'var(--color-border)' }}>
                                    Schedule Trade Loop
                                  </div>
                                  {[
                                    { label: 'Continuous', mode: 'continuous', desc: '10s interval, run forever', timeLeft: Infinity, intervalSec: 10 },
                                    { label: '1 Minute', mode: '1min', desc: '10s interval, 6 trades', timeLeft: 60, intervalSec: 10 },
                                    { label: '3 Minutes', mode: '3min', desc: '10s interval, 18 trades', timeLeft: 180, intervalSec: 10 },
                                  ].map((opt) => (
                                    <button
                                      key={opt.mode}
                                      onClick={() => {
                                        setActiveLoops(prev => ({
                                          ...prev,
                                          [agent.address]: {
                                            mode: opt.mode as any,
                                            timeLeft: opt.timeLeft,
                                            nextTradeIn: opt.intervalSec,
                                            intervalSec: opt.intervalSec,
                                          }
                                        }));
                                        setDropdownOpen(null);
                                        
                                        const newEv: LiveEvent = {
                                          id: 'mock-schedule-start-' + Date.now() + '-' + Math.random(),
                                          type: 'register',
                                          agent: agent.address,
                                          message: `Scheduled simulation loop started (${opt.label} mode)`,
                                          timestamp: new Date().toISOString(),
                                          digest: '0x' + Math.random().toString(16).substring(2, 12).toUpperCase() + ' (Sched)',
                                          isMocked: true,
                                        };
                                        setLiveEvents(evs => [newEv, ...evs].slice(0, 50));
                                      }}
                                      className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                                    >
                                      <div className="text-[12px] font-bold text-left" style={{ color: 'var(--color-text-primary)' }}>{opt.label}</div>
                                      <div className="text-[10px] text-left" style={{ color: 'var(--color-text-muted)' }}>{opt.desc}</div>
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                            {!activeLoops[agent.address] && (
                              <button
                                onClick={() => handleStepTrade(agent.address)}
                                className="px-2.5 py-1.5 rounded-lg text-[12px] font-semibold flex items-center gap-1 transition-all cursor-pointer border"
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
                                title="Execute a single simulated trade cycle immediately"
                              >
                                <Zap className="h-3.5 w-3.5 text-amber-500 fill-amber-500" /> Step
                              </button>
                            )}
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
          initialStrategyMode={settingsAgent.strategyMode}
          initialRiskLevel={settingsAgent.riskLevel}
          initialCopyTarget={settingsAgent.copyTarget}
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
          onSave={(settings) => {
            const updateAgent = (prev: AgentInfo[]) => prev.map(a => {
              if (a.address === settingsAgent.address) {
                const updated = {
                  ...a,
                  strategyMode: settings.strategyMode,
                  riskLevel: settings.riskLevel,
                  copyTarget: settings.copyTargetAddress,
                };
                if (settings.depositAmount !== undefined) {
                  updated.budget = (updated.budget || 25.0) + settings.depositAmount;
                }
                return updated;
              }
              return a;
            });
            setLocalAgents(updateAgent);
            setAgents(updateAgent);

            const updateEv: LiveEvent = {
              id: `policy-update-tx-${Date.now()}`,
              type: 'register',
              agent: settingsAgent.address,
              message: `Policy settings updated: Mode=${settings.strategyMode}, Risk=${settings.riskLevel}%, CopyTarget=${settings.copyTargetAddress || 'None'}${settings.depositAmount ? `, Deposited +${settings.depositAmount} dUSDC` : ''}`,
              timestamp: new Date().toISOString(),
              digest: '0x' + Math.random().toString(16).substring(2, 10) + '... (Mock)',
              isMocked: true,
            };
            setLiveEvents(prev => [updateEv, ...prev].slice(0, 50));
          }}
          onLiquidate={() => {
            const liquidateAgent = (prev: AgentInfo[]) => prev.map(a => {
              if (a.address === settingsAgent.address) {
                return {
                  ...a,
                  active: false,
                  budget: 0,
                  totalPnl: (a.totalPnl || 0) - (a.budget || 25.0),
                };
              }
              return a;
            });
            setLocalAgents(liquidateAgent);
            setAgents(liquidateAgent);

            setActiveLoops(prev => {
              const next = { ...prev };
              delete next[settingsAgent.address];
              return next;
            });

            const liquidateEv: LiveEvent = {
              id: `liquidate-tx-${Date.now()}`,
              type: 'slash',
              agent: settingsAgent.address,
              message: `Agent liquidated: Policy wallet revoked, remaining budget swept to owner.`,
              timestamp: new Date().toISOString(),
              digest: '0x' + Math.random().toString(16).substring(2, 10) + '... (Mock)',
              isMocked: true,
            };
            setLiveEvents(prev => [liquidateEv, ...prev].slice(0, 50));
          }}
        />
      )}
    </div>
  );
};
