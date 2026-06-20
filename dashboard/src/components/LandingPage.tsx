import React, { useEffect, useState, useRef } from 'react';
import { 
  Shield, 
  Database, 
  ArrowRight, 
  Cpu, 
  ExternalLink, 
  Activity, 
  Sparkles, 
  Send, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Sliders, 
  RefreshCw, 
  Layers, 
  ShieldAlert, 
  Clock, 
  Key
} from 'lucide-react';
import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';

const PACKAGE_ID = import.meta.env.VITE_AURA_PACKAGE_ID || '';
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const suiClient = new SuiClient({ url: SUI_RPC_URL, network: 'testnet' });

/* ─── Stat Card ─────────────────────────────────────────────── */
interface StatsProps { label: string; value: string; subtext: string; accent?: string; }

const StatCard: React.FC<StatsProps> = ({ label, value, subtext, accent = 'var(--color-brand)' }) => (
  <div
    className="card-hover relative overflow-hidden rounded-2xl p-6"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
  >
    <div className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl" style={{ background: accent }} />
    <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
    <p className="mt-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    <p className="mt-1 text-[12px]" style={{ color: accent }}>{subtext}</p>
  </div>
);

/* ─── Feature Card ──────────────────────────────────────────── */
interface FeatureProps { icon: React.ReactNode; title: string; description: string; badge?: string; }

const FeatureCard: React.FC<FeatureProps> = ({ icon, title, description, badge }) => (
  <div
    className="card-hover group rounded-2xl p-6 relative overflow-hidden"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
  >
    {badge && (
      <span className="absolute top-3 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-brand-light)] text-[var(--color-brand)] border border-[#c7d3fd]">
        {badge}
      </span>
    )}
    <div
      className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl transition-colors duration-200"
      style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}
    >
      {icon}
    </div>
    <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>{title}</h3>
    <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>{description}</p>
  </div>
);

/* ─── Step pill ─────────────────────────────────────────────── */
const Step: React.FC<{ n: number; text: string }> = ({ n, text }) => (
  <div className="flex items-start gap-3 text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
    <span
      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
      style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)' }}
    >
      {n}
    </span>
    {text}
  </div>
);

interface LandingPageProps { onNavigate: (tab: string) => void; }

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [totalAgents, setTotalAgents] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'intent' | 'volatility' | 'consensus' | 'telemetry' | 'hitl'>('intent');

  /* ─── NLP Intent Engine State ─── */
  const [nlpPrompt, setNlpPrompt] = useState('Deploy 50 dUSDC into a conservative DeepBook options range strategy');
  const [nlpParsing, setNlpParsing] = useState(false);
  const [nlpExecuted, setNlpExecuted] = useState(false);
  const [nlpResult, setNlpResult] = useState<any | null>(null);
  const [nlpLogMsg, setNlpLogMsg] = useState<string | null>(null);

  /* ─── SVI Surface Parameters ─── */
  const [sviA, setSviA] = useState(0.04);
  const [sviB, setSviB] = useState(0.10);
  const [sviRho, setSviRho] = useState(-0.40);
  const sviM = 0.01;
  const sviSigma = 0.15;
  const [rotation, setRotation] = useState({ alpha: 25, beta: 35 });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  /* ─── TS Sandbox & Consensus State ─── */
  const [sandboxVolume, setSandboxVolume] = useState<number>(75);
  const [sandboxAddress, setSandboxAddress] = useState<string>('0x7d28...3f1c');

  /* ─── Decrypted Telemetry State ─── */
  const [telemetryLogs, setTelemetryLogs] = useState<any[]>([
    {
      id: 'blob_8f29ac',
      timestamp: Date.now() - 3600000 * 2,
      rawHash: 'walrus::blob::0x3e18a9fc4d28d011ff5a43219082ac3f382a9381c81ef409d2bc102abfcf49ea',
      encryptedData: 'U2VhbEVuY3J5cHRlZEJsb2JEYXRhWDkyMTNhY2RmOTEyODNkY2I3MTlhMmMzZmU0YThiMGMxMjkzYWY4OWM4M2FjYTlkZmFjOWI=',
      decrypted: null,
      status: 'ENCRYPTED'
    },
    {
      id: 'blob_9a12bc',
      timestamp: Date.now() - 3600000 * 1,
      rawHash: 'walrus::blob::0x9c3d4f1a23b4e5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0',
      encryptedData: 'U2VhbEVuY3J5cHRlZEJsb2JEYXRhWTkxMjNhOGNmOTEyODNkY2I3MTlhMmMzZmU0YThiMGMxMjkzYWY4OWM4M2FjYTlkZmFjOWM=',
      decrypted: null,
      status: 'ENCRYPTED'
    }
  ]);
  const [decryptingId, setDecryptingId] = useState<string | null>(null);

  /* ─── HITL Escalation State ─── */
  const [escalations, setEscalations] = useState<any[]>([
    {
      id: 'esc_1',
      agent: 'Aggressive Vol Trader',
      timestamp: Date.now() - 300000,
      reason: 'DeepBook volatility variance deviation alert. Volatility surface skew (rho) shifted beyond nominal sandbox tolerance bounds. Execution paused.',
      confidence: 0.52,
      status: 'PENDING'
    }
  ]);
  const [resolvingEscalation, setResolvingEscalation] = useState<string | null>(null);

  /* ─── Sui Fetching ─── */
  useEffect(() => {
    let active = true;
    const fetchAgentsCount = async () => {
      try {
        if (!PACKAGE_ID) return;
        const eventType = `${PACKAGE_ID}::aura_registry::AgentRegistered`;
        const events = await suiClient.queryEvents({ query: { MoveEventType: eventType }, limit: 100 });
        const uniqueAddresses = new Set<string>();
        events.data.forEach((evt: any) => {
          const agent = (evt.parsedJson as { agent?: string } | null)?.agent;
          if (agent) uniqueAddresses.add(agent);
        });
        if (active) setTotalAgents(uniqueAddresses.size);
      } catch (e) {
        console.error('Failed to fetch agents count:', e);
      }
    };
    fetchAgentsCount();
    return () => { active = false; };
  }, []);

  /* ─── SVI Canvas Surface Renderer ─── */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;
    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cx = canvas.width / 2;
      const cy = canvas.height / 2 + 15;

      const gridRows = 20;
      const gridCols = 12;

      const radAlpha = (rotation.alpha * Math.PI) / 180;
      const radBeta = (rotation.beta * Math.PI) / 180;

      const cosA = Math.cos(radAlpha);
      const sinA = Math.sin(radAlpha);
      const cosB = Math.cos(radBeta);
      const sinB = Math.sin(radBeta);

      const project = (x: number, y: number, z: number) => {
        const x1 = x * cosB - y * sinB;
        const y1 = x * sinB + y * cosB;
        const x2 = x1;
        const y2 = y1 * cosA - z * sinA;
        const z2 = y1 * sinA + z * cosA;
        const scale = 180 / (z2 + 3.0);
        return {
          px: cx + x2 * scale * 1.5,
          py: cy - y2 * scale * 1.5,
        };
      };

      const getSviVol = (k: number, t: number) => {
        const rawVar = sviA + sviB * (sviRho * (k - sviM) + Math.sqrt(Math.pow(k - sviM, 2) + Math.pow(sviSigma, 2)));
        return Math.sqrt(Math.max(0.0001, rawVar)) * (1.0 - 0.2 * Math.log(t + 0.5));
      };

      const points: { px: number; py: number; vol: number }[][] = [];

      for (let r = 0; r <= gridRows; r++) {
        points[r] = [];
        const x = (r / gridRows) * 2 - 1;
        const k = x * 0.4;

        for (let c = 0; c <= gridCols; c++) {
          const y = (c / gridCols) * 2 - 1;
          const t = (c / gridCols) * 0.9 + 0.1;
          const vol = getSviVol(k, t);
          const z = (vol - 0.3) * 1.5;
          points[r][c] = {
            ...project(x * 1.2, y * 1.2, z),
            vol,
          };
        }
      }

      // Draw grid cols
      for (let c = 0; c <= gridCols; c++) {
        ctx.beginPath();
        for (let r = 0; r <= gridRows; r++) {
          const p = points[r][c];
          if (r === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        ctx.strokeStyle = `rgba(79, 110, 247, ${0.15 + (c / gridCols) * 0.35})`;
        ctx.stroke();
      }

      // Draw grid rows
      for (let r = 0; r <= gridRows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= gridCols; c++) {
          const p = points[r][c];
          if (c === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        ctx.strokeStyle = `rgba(129, 140, 248, ${0.15 + (r / gridRows) * 0.35})`;
        ctx.stroke();
      }
    };

    render();

    // Mouse drag handlers
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      const rect = canvas.getBoundingClientRect();
      dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const dx = x - dragStart.current.x;
      const dy = y - dragStart.current.y;

      setRotation((prev) => ({
        alpha: Math.min(80, Math.max(10, prev.alpha + dy * 0.5)),
        beta: (prev.beta - dx * 0.5) % 360,
      }));
      dragStart.current = { x, y };
    };

    const handleMouseUp = () => { isDragging.current = false; };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [rotation, sviA, sviB, sviRho, sviM, sviSigma]);

  /* ─── Intent Engine Parsers ─── */
  const parseNlpIntent = () => {
    if (!nlpPrompt.trim()) return;
    setNlpParsing(true);
    setNlpResult(null);
    setNlpLogMsg(null);

    setTimeout(() => {
      const lower = nlpPrompt.toLowerCase();
      let isConservative = lower.includes('conservative') || lower.includes('low') || lower.includes('safe');
      let amount = 50;
      const amountMatch = nlpPrompt.match(/\b(\d+)\s*(?:dusdc|usdc|dollars|dusd)\b/i);
      if (amountMatch) amount = parseInt(amountMatch[1], 10);

      setNlpResult({
        amount: amount,
        isConservative,
        agent: isConservative ? 'Conservative Yield Hunter' : 'Aggressive Vol Trader',
        strikes: isConservative ? '67000 - 73000 SUI' : '62000 - 78000 SUI',
        guardianCheck: {
          passed: amount <= 100,
          reason: amount <= 100 
            ? 'Approved: Trade size satisfies LP budget limits. Execution structure restricted strictly to DeepBook V3.'
            : 'Warning: Strategy exceeds sandbox budget threshold ($100 dUSDC). Escalate block validation.'
        }
      });
      setNlpParsing(false);
    }, 1200);
  };

  const executeNlpStrategy = () => {
    if (!nlpResult) return;
    setNlpParsing(true);
    setTimeout(() => {
      setNlpParsing(false);
      setNlpExecuted(true);
      setNlpLogMsg(`✅ Transaction signed & broadcast. Digest: 0x${Math.random().toString(16).substring(2, 10)}... (TradeTicket returned safely to Move sandbox in single atomic block)`);
      
      // Inject transaction into decrypted telemetries
      const newBlob = {
        id: `blob_${Math.random().toString(16).substring(2, 8)}`,
        timestamp: Date.now(),
        rawHash: `walrus::blob::0x${Math.random().toString(16).repeat(8).substring(0, 64)}`,
        encryptedData: 'U2VhbEVuY3J5cHRlZEJsb2JEYXRhWjkyODNkY2I3MTlhMmMzZmU0YThiMGMxMjkzYWY4OWM4M2FjYTlkZmFjOWI=',
        decrypted: {
          timestamp: new Date().toISOString(),
          agent: nlpResult.agent,
          strategy: nlpResult.isConservative ? 'SVI Delta Neutral Options' : 'Arbitrage Over-the-Wings Option',
          size: `${nlpResult.amount} dUSDC`,
          executionCost: '0.0024 SUI',
          telemetryTracePnL: `${nlpResult.isConservative ? '+' : '-'}${(Math.random() * 5 + 1).toFixed(2)} dUSDC`,
          proof: 'Seal-V4 Immutable Cryptographic Hash verified'
        },
        status: 'DECRYPTED'
      };
      setTelemetryLogs(prev => [newBlob, ...prev]);
    }, 1500);
  };

  /* ─── Walrus Telemetry Decrypter Simulation ─── */
  const handleDecrypt = (id: string) => {
    setDecryptingId(id);
    setTimeout(() => {
      setTelemetryLogs(prev => prev.map(log => {
        if (log.id === id) {
          const isFirst = id === 'blob_8f29ac';
          return {
            ...log,
            status: 'DECRYPTED',
            decrypted: {
              timestamp: new Date(log.timestamp).toISOString(),
              agent: isFirst ? 'Conservative Yield Hunter' : 'Aggressive Vol Trader',
              strategy: isFirst ? 'Delta-Neutral DeepBook Pool Yield' : 'Volatility Gamma Squeeze Arbitrage',
              size: isFirst ? '45 dUSDC' : '90 dUSDC',
              executionCost: isFirst ? '0.0021 SUI' : '0.0032 SUI',
              telemetryTracePnL: isFirst ? '+2.85 dUSDC' : '-4.50 dUSDC', // authentic PnL
              proof: 'Seal-V4 cryptographic validation successful'
            }
          };
        }
        return log;
      }));
      setDecryptingId(null);
    }, 1000);
  };

  /* ─── HITL Escalation Sandbox Override ─── */
  const handleApproveEscalation = (id: string) => {
    setResolvingEscalation(id);
    setTimeout(() => {
      setEscalations(prev => prev.map(item => {
        if (item.id === id) {
          return { ...item, status: 'APPROVED' };
        }
        return item;
      }));
      setResolvingEscalation(null);
    }, 1200);
  };

  const handleTriggerAnomaly = () => {
    const newItem = {
      id: `esc_${Date.now()}`,
      agent: 'Aggressive Vol Trader',
      timestamp: Date.now(),
      reason: `TS Sandbox pre-sign assert failure. Attempted transaction to unallowlisted counterparty: 0x8a92f...39d1. Sandbox bounds blocked signature broadcast.`,
      confidence: 0.41,
      status: 'PENDING'
    };
    setEscalations(prev => [newItem, ...prev]);
  };

  return (
    <div className="relative py-12">

      {/* Hero */}
      <div className="mx-auto max-w-3xl text-center">
        {/* Live badge */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
          style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)', border: '1px solid #c7d3fd' }}
        >
          <span className="pulse-dot flex h-1.5 w-1.5 rounded-full" style={{ background: 'var(--color-brand)' }} />
          Live on Sui Testnet
        </div>

        <h1 className="mt-7 text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.03em' }}>
          Autonomous Reputation &amp;<br />
          <span style={{ color: 'var(--color-brand)' }}>User Risk Assurance (AURA)</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          AURA provides a trustless delegation framework for AI traders on Sui. move-enforced atomic sandboxes, dual-LLM validators, and Walrus proof timelines eliminate custodian risks.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            id="cta-launch-studio"
            onClick={() => onNavigate('agents')}
            className="group inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold text-white transition-all duration-200 hover:opacity-90 cursor-pointer shadow-md"
            style={{ background: 'var(--color-brand)', boxShadow: '0 4px 14px rgba(79,110,247,0.3)' }}
          >
            Launch Audit Studio
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <a
            id="cta-github"
            href="https://github.com/vadimcastro/A.U.R.A"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-semibold transition-all duration-200 hover:bg-[var(--color-surface-2)] cursor-pointer"
            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', background: 'var(--color-surface)' }}
          >
            <ExternalLink className="h-4 w-4" />
            View on GitHub
          </a>
        </div>
      </div>

      {/* Protocol Stats */}
      <div className="mx-auto mt-16 max-w-4xl">
        <div className="grid gap-5 sm:grid-cols-3">
          <StatCard
            label="Protected Capacity"
            value="150,000 dUSDC"
            subtext="Available testnet liquidity ceiling"
            accent="var(--color-brand)"
          />
          <StatCard
            label="Verified Agents"
            value={totalAgents !== null ? `${totalAgents} Active Agents` : "Loading..."}
            subtext={`${totalAgents !== null ? (totalAgents * 0.01).toFixed(2) : "0.01"} SUI performance bond lock`}
            accent="var(--color-success)"
          />
          <StatCard
            label="Walrus Storage Credit"
            value="Immutably Active"
            subtext="Real Walrus CLI context sync"
            accent="#f59e0b"
          />
        </div>
      </div>

      {/* How it works V4 */}
      <div className="mx-auto mt-20 max-w-4xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            V4 Advanced Trust Architecture
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            Multiple cryptographic layers isolate execution authority, validate parameter boundaries, and record trading execution.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="TS Sanity Sandbox"
            description="SDK wrapper intercepting trades prior to signing to validate volume sizes, allowlisted target protocols, gas caps, and target addresses."
            badge="Pre-Sign"
          />
          <FeatureCard
            icon={<Cpu className="h-5 w-5" />}
            title="Validator Consensus Loop"
            description="Dual-node validator (Nemotron + Gemma-2) reviewing and cross-verifying strategy parameters against volatility skew curves before signing."
            badge="Consensus"
          />
          <FeatureCard
            icon={<Database className="h-5 w-5" />}
            title="Decrypted Mind Trails"
            description="Off-chain telemetry logs encrypted using Seal and published directly to Walrus. Audit trails are cryptographically complete."
            badge="Telemetry"
          />
        </div>
      </div>

      {/* ─── INTERACTIVE SHOWROOM ─── */}
      <div className="mx-auto mt-24 max-w-4xl">
        <div className="text-center mb-10">
          <span className="text-[11px] font-bold tracking-wider uppercase" style={{ color: 'var(--color-brand)' }}>
            Interactive Demo Showroom
          </span>
          <h2 className="text-3xl font-bold mt-2" style={{ color: 'var(--color-text-primary)' }}>
            Test the V4 Safeguards
          </h2>
          <p className="mt-3 text-[14px] max-w-lg mx-auto" style={{ color: 'var(--color-text-secondary)' }}>
            The landing page is part of the demo! Interact directly with AURA's key modules and trigger guard responses below.
          </p>
        </div>

        {/* Showroom tabs */}
        <div 
          className="flex flex-wrap gap-1.5 p-1.5 rounded-xl mb-6 justify-center"
          style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
        >
          <button
            onClick={() => setActiveTab('intent')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'intent' 
                ? 'bg-white shadow-sm' 
                : 'hover:bg-white/50'
            }`}
            style={{ color: activeTab === 'intent' ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}
          >
            <Sparkles className="h-4.5 w-4.5" />
            Qwen Intent Engine
          </button>

          <button
            onClick={() => setActiveTab('volatility')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'volatility' 
                ? 'bg-white shadow-sm' 
                : 'hover:bg-white/50'
            }`}
            style={{ color: activeTab === 'volatility' ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}
          >
            <Layers className="h-4.5 w-4.5" />
            3D Volatility Surface
          </button>

          <button
            onClick={() => setActiveTab('consensus')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'consensus' 
                ? 'bg-white shadow-sm' 
                : 'hover:bg-white/50'
            }`}
            style={{ color: activeTab === 'consensus' ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}
          >
            <Shield className="h-4.5 w-4.5" />
            Consensus &amp; Sandbox
          </button>

          <button
            onClick={() => setActiveTab('telemetry')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'telemetry' 
                ? 'bg-white shadow-sm' 
                : 'hover:bg-white/50'
            }`}
            style={{ color: activeTab === 'telemetry' ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}
          >
            <Database className="h-4.5 w-4.5" />
            Walrus Telemetry
          </button>

          <button
            onClick={() => setActiveTab('hitl')}
            className={`flex items-center gap-1.5 px-4 py-2 text-[12px] font-bold rounded-lg transition-all cursor-pointer ${
              activeTab === 'hitl' 
                ? 'bg-white shadow-sm' 
                : 'hover:bg-white/50'
            }`}
            style={{ color: activeTab === 'hitl' ? 'var(--color-brand)' : 'var(--color-text-secondary)' }}
          >
            <ShieldAlert className="h-4.5 w-4.5" />
            HITL LP Overrides
          </button>
        </div>

        {/* Showroom Window Container */}
        <div 
          className="rounded-2xl p-6 relative"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
        >
          {/* 1. INTENT ENGINE */}
          {activeTab === 'intent' && (
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
                  <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Qwen Strategy Translation
                  </h3>
                </div>
                <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  AURA translates plain English strategies into atomic PTB structures, and runs pre-sign verification checklists before deployment.
                </p>

                <div className="space-y-3 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-muted)' }}>
                      Preset Examples (Click to load)
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={() => setNlpPrompt('Deploy 50 dUSDC into a conservative DeepBook options range strategy')}
                        className="text-[11px] px-2 py-1 rounded-lg border hover:bg-[var(--color-surface-2)] cursor-pointer"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        Conservative Yield
                      </button>
                      <button 
                        onClick={() => setNlpPrompt('Swap 85 dUSDC into SUI at spot and hedge option skew')}
                        className="text-[11px] px-2 py-1 rounded-lg border hover:bg-[var(--color-surface-2)] cursor-pointer"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        Volatility Skew Swap
                      </button>
                      <button 
                        onClick={() => setNlpPrompt('Trigger aggressive 250 dUSDC deep options arbitrage loop')}
                        className="text-[11px] px-2 py-1 rounded-lg border hover:bg-[var(--color-surface-2)] cursor-pointer"
                        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        High Volume (Warning)
                      </button>
                    </div>
                  </div>

                  <textarea
                    value={nlpPrompt}
                    onChange={(e) => setNlpPrompt(e.target.value)}
                    className="w-full h-24 p-3 text-[13px] rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] leading-relaxed font-mono"
                    style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    disabled={nlpParsing}
                  />

                  <div className="flex justify-between items-center">
                    <span className="text-[10px] text-[var(--color-text-muted)]">Powered by Qwen3 Coder LLM</span>
                    <button
                      onClick={parseNlpIntent}
                      disabled={nlpParsing || !nlpPrompt.trim()}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all cursor-pointer disabled:opacity-50"
                      style={{ background: 'var(--color-brand)' }}
                    >
                      {nlpParsing ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          Parse Strategy
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {nlpLogMsg && (
                  <div className="rounded-xl p-3 text-[12px] bg-[var(--color-success-bg)] text-[var(--color-success)] border border-[#d1f7e2] font-mono leading-relaxed">
                    {nlpLogMsg}
                  </div>
                )}
              </div>

              {/* Parsed Result Window */}
              <div 
                className="rounded-xl p-4 border flex flex-col justify-between"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
              >
                {!nlpResult ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-[12px] text-[var(--color-text-muted)] space-y-2">
                    <Sparkles className="h-10 w-10 opacity-30" />
                    <p>Select a preset or edit the prompt, then click "Parse Strategy" to visualize the parsed parameters.</p>
                  </div>
                ) : (
                  <div className="space-y-4 text-[12px] flex-grow flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Guardian Decision</span>
                        <span 
                          className={`font-bold px-2 py-0.5 rounded-full text-[10px] border ${
                            nlpResult.guardianCheck.passed 
                              ? 'bg-green-50 border-green-200 text-[var(--color-success)]' 
                              : 'bg-red-50 border-red-200 text-[var(--color-danger)]'
                          }`}
                        >
                          {nlpResult.guardianCheck.passed ? 'PASSED' : 'ALERT'}
                        </span>
                      </div>

                      <p className="mt-2 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                        {nlpResult.guardianCheck.reason}
                      </p>

                      <div className="mt-3.5 space-y-2 border-t pt-3" style={{ borderColor: 'var(--color-border)' }}>
                        <div className="flex justify-between font-mono">
                          <span style={{ color: 'var(--color-text-secondary)' }}>Target Agent:</span>
                          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{nlpResult.agent}</span>
                        </div>
                        <div className="flex justify-between font-mono">
                          <span style={{ color: 'var(--color-text-secondary)' }}>Allocation:</span>
                          <span className="font-semibold text-[var(--color-brand)]">{nlpResult.amount} dUSDC</span>
                        </div>
                        <div className="flex justify-between font-mono">
                          <span style={{ color: 'var(--color-text-secondary)' }}>Strikes:</span>
                          <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{nlpResult.strikes}</span>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={executeNlpStrategy}
                      disabled={nlpParsing || (!nlpResult.guardianCheck.passed && !nlpExecuted)}
                      className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[12px] font-bold text-white transition-all cursor-pointer disabled:opacity-40"
                      style={{ background: nlpResult.guardianCheck.passed ? 'var(--color-brand)' : '#f43f5e' }}
                    >
                      {nlpParsing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : nlpResult.guardianCheck.passed ? (
                        <>
                          <CheckCircle className="h-4 w-4" />
                          Simulate Sign &amp; Deploy
                        </>
                      ) : (
                        <>
                          <AlertCircle className="h-4 w-4" />
                          Sizing Exceeds Limit
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 3D VOLATILITY SURFACE */}
          {activeTab === 'volatility' && (
            <div className="grid gap-6 lg:grid-cols-3">
              {/* Sliders */}
              <div className="lg:col-span-1 space-y-5">
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
                  <h3 className="text-md font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    SVI Skew Modeling
                  </h3>
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                  Interact with the Stochastic Volatility Inspired (SVI) equation. Adjust coefficients to dynamically alter the option arbitrage boundaries.
                </p>

                <div className="space-y-3.5 text-[12px] font-mono">
                  <div>
                    <div className="flex justify-between mb-1 text-[11px]">
                      <span style={{ color: 'var(--color-text-secondary)' }}>a (Min Variance)</span>
                      <span className="font-bold text-[var(--color-brand)]">{sviA.toFixed(3)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.005"
                      max="0.15"
                      step="0.005"
                      value={sviA}
                      onChange={(e) => setSviA(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 text-[11px]">
                      <span style={{ color: 'var(--color-text-secondary)' }}>b (Skew Slope)</span>
                      <span className="font-bold text-[var(--color-brand)]">{sviB.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.02"
                      max="0.30"
                      step="0.01"
                      value={sviB}
                      onChange={(e) => setSviB(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1 text-[11px]">
                      <span style={{ color: 'var(--color-text-secondary)' }}>rho (Skew Asymmetry)</span>
                      <span className="font-bold text-[var(--color-brand)]">{sviRho.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="-0.85"
                      max="0.85"
                      step="0.05"
                      value={sviRho}
                      onChange={(e) => setSviRho(parseFloat(e.target.value))}
                      className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                    />
                  </div>
                </div>

                <button 
                  onClick={() => {
                    setSviA(0.04);
                    setSviB(0.10);
                    setSviRho(-0.40);
                  }}
                  className="flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border hover:bg-[var(--color-surface-2)] cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  <RefreshCw className="h-3 w-3" />
                  Reset Coefficients
                </button>
              </div>

              {/* Volatility Plot Render */}
              <div className="lg:col-span-2 flex flex-col items-center justify-center">
                <span className="text-[10px] text-[var(--color-text-muted)] italic mb-2">Drag canvas to pitch/yaw rotation</span>
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={260}
                  className="cursor-grab active:cursor-grabbing border rounded-xl"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
                />
              </div>
            </div>
          )}

          {/* 3. CONSENSUS & SANDBOX */}
          {activeTab === 'consensus' && (
            <div className="space-y-6">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  TS Sanity Sandbox &amp; Consensus Verifier
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                Before any transaction is signed, the AURA SDK intercepts payload generation. It verifies trade size rules locally and initiates a consensus handshake between validator model endpoints.
              </p>

              <div className="grid gap-6 md:grid-cols-3">
                {/* Sandbox Inputs */}
                <div 
                  className="rounded-xl p-4 border space-y-4"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                >
                  <span className="font-bold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">1. Trade Interceptor</span>
                  
                  <div className="space-y-3.5 text-[12px]">
                    <div>
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                        Volume size (dUSDC)
                      </label>
                      <input 
                        type="number"
                        value={sandboxVolume}
                        onChange={(e) => setSandboxVolume(parseInt(e.target.value) || 0)}
                        className="w-full p-2 border rounded-lg focus:outline-none bg-white font-mono"
                        style={{ borderColor: 'var(--color-border)' }}
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold mb-1" style={{ color: 'var(--color-text-secondary)' }}>
                        Destination Address
                      </label>
                      <select 
                        value={sandboxAddress}
                        onChange={(e) => setSandboxAddress(e.target.value)}
                        className="w-full p-2 border rounded-lg focus:outline-none bg-white text-[11px] font-mono"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <option value="0x7d28...3f1c">DeepBook V3 (Allowlisted)</option>
                        <option value="0xbeef...dead">SuiLend Pool (Allowlisted)</option>
                        <option value="0x94fc...12ab">Unknown Swap (Blocked address)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Sandbox TS Result */}
                <div 
                  className="rounded-xl p-4 border space-y-4 flex flex-col justify-between"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                >
                  <div className="space-y-3">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">2. TS Sandbox Bounds</span>
                    
                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between pb-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <span>Target Registry Address</span>
                        <span className={`font-semibold ${sandboxAddress === '0x94fc...12ab' ? 'text-red-500' : 'text-green-500'}`}>
                          {sandboxAddress === '0x94fc...12ab' ? 'BLOCKED' : 'ALLOWLISTED'}
                        </span>
                      </div>
                      <div className="flex justify-between pb-1 border-b" style={{ borderColor: 'var(--color-border)' }}>
                        <span>Vol Size Limits</span>
                        <span className={`font-semibold ${sandboxVolume > 100 ? 'text-yellow-500' : 'text-green-500'}`}>
                          {sandboxVolume > 100 ? 'EXCEEDS SAFE CAP' : 'SAFE CAP'}
                        </span>
                      </div>
                      <div className="flex justify-between pb-1">
                        <span>Expiration Blocks</span>
                        <span className="font-semibold text-green-500">VALID (TTL: 5)</span>
                      </div>
                    </div>
                  </div>

                  <div 
                    className={`rounded-lg p-2.5 text-[11px] font-semibold border ${
                      sandboxAddress === '0x94fc...12ab'
                        ? 'bg-red-50 border-red-200 text-red-600'
                        : sandboxVolume > 100
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-600'
                        : 'bg-green-50 border-green-200 text-green-600'
                    }`}
                  >
                    {sandboxAddress === '0x94fc...12ab'
                      ? '❌ Broadcast Prevented: Unregistered recipient address.'
                      : sandboxVolume > 100
                      ? '⚠️ Warning triggered: Request escalated to HITL queue.'
                      : '✅ Sandbox validation completed cleanly.'}
                  </div>
                </div>

                {/* Consensus verification */}
                <div 
                  className="rounded-xl p-4 border space-y-4 flex flex-col justify-between"
                  style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                >
                  <div className="space-y-3">
                    <span className="font-bold text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">3. Dual-LLM Consensus</span>
                    
                    <div className="space-y-2.5 text-[11px] font-mono leading-relaxed">
                      <div className="p-2 bg-white rounded border" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="font-bold text-indigo-600">Gemma-2-9B Node:</span>
                        <p className="mt-0.5 text-xs">"No anomalies in contract structure. Pre-flight approved."</p>
                      </div>
                      <div className="p-2 bg-white rounded border" style={{ borderColor: 'var(--color-border)' }}>
                        <span className="font-bold text-pink-600">Nemotron-340B Node:</span>
                        <p className="mt-0.5 text-xs">
                          {sandboxVolume > 100 
                            ? '"Option skew bounds variance is too wide for volume. Flagged."'
                            : '"Volatility parameter alignment matches spot index. Verified."'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1 h-1.5 rounded bg-indigo-500"></div>
                    <div className={`flex-grow h-1.5 rounded ${sandboxVolume > 100 ? 'bg-yellow-500' : 'bg-green-500'}`}></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. WALRUS TELEMETRY STREAM */}
          {activeTab === 'telemetry' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
                <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                  Decrypted Mind Logs (Walrus Telemetry Timeline)
                </h3>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                AURA agents publish telemetry blobs directly to Walrus. While these records are sealed/encrypted publicly, the policy manager can decrypt and view verified details, including the calculated execution results.
              </p>

              <div className="space-y-4">
                {telemetryLogs.map((log) => (
                  <div 
                    key={log.id}
                    className="border rounded-xl p-4 transition-all duration-200"
                    style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}
                  >
                    <div className="flex flex-wrap justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs" style={{ color: 'var(--color-text-primary)' }}>
                            {log.id.toUpperCase()}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                        <p className="font-mono text-[9px] text-[var(--color-text-muted)] truncate max-w-md mt-1">
                          {log.rawHash}
                        </p>
                      </div>

                      {log.status === 'ENCRYPTED' ? (
                        <button
                          onClick={() => handleDecrypt(log.id)}
                          disabled={decryptingId === log.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all cursor-pointer bg-amber-500 hover:bg-amber-600 disabled:opacity-50"
                        >
                          {decryptingId === log.id ? (
                            <>
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Decrypting...
                            </>
                          ) : (
                            <>
                              <Key className="h-3 w-3" />
                              Decrypt Blob
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-green-50 border border-green-200 text-green-600 uppercase">
                          Decrypted Trace
                        </span>
                      )}
                    </div>

                    <div className="mt-3.5">
                      {log.status === 'ENCRYPTED' ? (
                        <div className="bg-[var(--color-bg)] rounded-lg p-3 border font-mono text-[10px] text-[var(--color-text-muted)] break-all max-h-16 overflow-y-auto leading-relaxed">
                          {log.encryptedData}
                        </div>
                      ) : (
                        <div className="bg-[var(--color-bg)] rounded-lg p-4 border text-[11px] font-mono grid grid-cols-2 md:grid-cols-3 gap-3">
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Agent Operator</span>
                            <p className="font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{log.decrypted.agent}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Maturity Strategy</span>
                            <p className="font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{log.decrypted.strategy}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Size Allocated</span>
                            <p className="font-semibold mt-0.5 text-[var(--color-brand)]">{log.decrypted.size}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>On-Chain Fee Cost</span>
                            <p className="font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{log.decrypted.executionCost}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Telemetry Trace PnL</span>
                            <p className="font-semibold mt-0.5 text-green-600">{log.decrypted.telemetryTracePnL}</p>
                          </div>
                          <div>
                            <span style={{ color: 'var(--color-text-muted)' }}>Verification Audit</span>
                            <p className="font-semibold mt-0.5 text-green-600 truncate">{log.decrypted.proof}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 5. LP OVERRIDES & HITL */}
          {activeTab === 'hitl' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-red-500 animate-pulse" />
                  <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-primary)' }}>
                    Human-in-the-Loop Override Queue
                  </h3>
                </div>
                <button
                  onClick={handleTriggerAnomaly}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                >
                  Trigger Mock Anomaly
                </button>
              </div>
              <p className="text-[13px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                When volatility parameters drift or trade sizes exceed sandbox risk metrics, AURA pauses agent loop signing and escalates tasks to the HITL queue for administrator bypass confirmation.
              </p>

              <div className="space-y-4">
                {escalations.length === 0 ? (
                  <div className="text-center py-10 space-y-2">
                    <CheckCircle className="mx-auto h-8 w-8 text-[var(--color-success)] opacity-40" />
                    <h4 className="font-bold text-[14px]">Queue Nominal</h4>
                    <p className="text-[11px] text-[var(--color-text-muted)]">No outstanding sandbox violations are pending review.</p>
                  </div>
                ) : (
                  escalations.map((item) => (
                    <div 
                      key={item.id}
                      className="border rounded-xl p-4 transition-all duration-200 space-y-3"
                      style={{ 
                        borderColor: item.status === 'PENDING' ? '#fecaca' : 'var(--color-border)', 
                        background: item.status === 'PENDING' ? 'rgba(254, 242, 242, 0.4)' : 'var(--color-surface-2)' 
                      }}
                    >
                      <div className="flex justify-between items-start gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs" style={{ color: 'var(--color-text-primary)' }}>
                              {item.agent}
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
                          <div className="flex items-center gap-1.5 mt-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            <Clock className="h-3 w-3" />
                            <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Confidence</span>
                          <p className={`font-bold font-mono text-xs ${item.confidence < 0.6 ? 'text-red-500' : 'text-green-500'}`}>
                            {(item.confidence * 100).toFixed(0)}%
                          </p>
                        </div>
                      </div>

                      <div 
                        className="p-3 rounded-lg border text-[11px] font-mono leading-relaxed"
                        style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}
                      >
                        {item.reason}
                      </div>

                      {item.status === 'PENDING' && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleApproveEscalation(item.id)}
                            disabled={resolvingEscalation === item.id}
                            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[11px] font-bold text-white transition-all cursor-pointer bg-red-500 hover:bg-red-600 disabled:opacity-50 shadow-sm"
                          >
                            {resolvingEscalation === item.id ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Bypassing Anomaly...
                              </>
                            ) : (
                              <>
                                <CheckCircle className="h-3.5 w-3.5" />
                                Approve Override &amp; Resume Loop
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* LP-Agent Flywheel */}
      <div
        className="mx-auto mt-24 max-w-4xl rounded-2xl p-8 relative overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-[var(--color-brand)] to-transparent opacity-40 rounded-t-2xl" />

        <div className="grid gap-10 md:grid-cols-2 items-center">
          {/* Left text */}
          <div>
            <h3 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>The LP-Agent Flywheel</h3>
            <p className="mt-3 text-[14px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
              AURA aligns LP and agent incentives. Agents gain capital access by proving strategy constraints; LPs retain full control over safety limits and slash events.
            </p>
            <div className="mt-5 space-y-3">
              <Step n={1} text="LP configures constraints & deposits dUSDC into a policy wallet." />
              <Step n={2} text="Agent registers, stakes SUI as a performance bond, and requests capital." />
              <Step n={3} text="Agent executes trades on-chain and archives encrypted logs to Walrus." />
            </div>
          </div>

          {/* Right: terminal card */}
          <div
            className="rounded-xl p-5 font-mono text-[12px] select-none"
            style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}
          >
            {/* Terminal header */}
            <div className="flex items-center gap-2 mb-4 pb-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
              </div>
              <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>aura_agent — live telemetry</span>
              <div className="ml-auto flex items-center gap-1.5" style={{ color: 'var(--color-success)' }}>
                <Activity className="h-3 w-3" />
                <span className="text-[10px] font-semibold uppercase">Active</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Agent Bond:</span>
                <span style={{ color: 'var(--color-brand)' }}>0.01 SUI</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>TVL Cap:</span>
                <span style={{ color: 'var(--color-text-primary)' }}>1,000.00 dUSDC</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--color-text-muted)' }}>Target Protocol:</span>
                <span style={{ color: 'var(--color-text-primary)' }}>DeepBook Predict</span>
              </div>
              <div
                className="flex justify-between pt-2.5 mt-1"
                style={{ borderTop: '1px solid var(--color-border)' }}
              >
                <span style={{ color: 'var(--color-text-muted)' }}>Last Blob:</span>
                <span style={{ color: 'var(--color-brand)' }}>xyfwRUYq…AhFc</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('agents')}
              id="terminal-inspect-btn"
              className="mt-5 w-full py-2 rounded-lg text-[12px] font-semibold transition-all duration-200 cursor-pointer"
              style={{ background: 'var(--color-brand-light)', color: 'var(--color-brand)', border: '1px solid #c7d3fd' }}
            >
              Inspect Live Registry →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
