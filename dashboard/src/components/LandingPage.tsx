import React from 'react';
import { Shield, Database, ArrowRight, Cpu, ExternalLink, Activity } from 'lucide-react';

/* ─── Stat Card ─────────────────────────────────────────────── */
interface StatsProps { label: string; value: string; subtext: string; accent?: string; }

const StatCard: React.FC<StatsProps> = ({ label, value, subtext, accent = 'var(--color-brand)' }) => (
  <div
    className="card-hover relative overflow-hidden rounded-2xl p-6"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
  >
    {/* Accent top bar */}
    <div className="absolute top-0 inset-x-0 h-0.5 rounded-t-2xl" style={{ background: accent }} />
    <p className="text-[13px] font-medium" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
    <p className="mt-2 text-2xl font-bold tracking-tight" style={{ color: 'var(--color-text-primary)' }}>{value}</p>
    <p className="mt-1 text-[12px]" style={{ color: accent }}>{subtext}</p>
  </div>
);

/* ─── Feature Card ──────────────────────────────────────────── */
interface FeatureProps { icon: React.ReactNode; title: string; description: string; }

const FeatureCard: React.FC<FeatureProps> = ({ icon, title, description }) => (
  <div
    className="card-hover group rounded-2xl p-6"
    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
  >
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

/* ─── Landing Page ──────────────────────────────────────────── */
import { SuiJsonRpcClient as SuiClient } from '@mysten/sui/jsonRpc';
import { useEffect, useState } from 'react';

const PACKAGE_ID = import.meta.env.VITE_AURA_PACKAGE_ID || '';
// const REGISTRY_OBJECT_ID = import.meta.env.VITE_REGISTRY_OBJECT_ID || '';
const SUI_RPC_URL = import.meta.env.VITE_SUI_RPC_URL || 'https://fullnode.testnet.sui.io:443';
const suiClient = new SuiClient({ url: SUI_RPC_URL, network: 'testnet' });

interface LandingPageProps { onNavigate: (tab: string) => void; }

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  const [totalAgents, setTotalAgents] = useState<number | null>(null);

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
          <span style={{ color: 'var(--color-brand)' }}>User Risk Assurance</span>
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          AURA secures on-chain delegated capital for autonomous DeFi agents. Move-enforced sandboxes and Walrus audit trails eliminate agent trust risk.
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
            subtext={`${totalAgents !== null ? (totalAgents * 0.01).toFixed(2) : "0.01"} SUI collateral bonds locked`}
            accent="var(--color-success)"
          />
          <StatCard
            label="Telemetry Blobs"
            value="Walrus-backed"
            subtext="Immutably synced audit history"
            accent="#f59e0b"
          />
        </div>
      </div>

      {/* How it works */}
      <div className="mx-auto mt-20 max-w-4xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            How AURA Protects Your Capital
          </h2>
          <p className="mt-3 text-[14px]" style={{ color: 'var(--color-text-secondary)' }}>
            A three-tier trust architecture separating execution authority, capital constraints, and performance proof.
          </p>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Move VM Sandboxes"
            description="LPs delegate funds inside a WalletPolicy. The Move VM strictly limits transaction budgets, expiration blocks, and allowlisted target contracts."
          />
          <FeatureCard
            icon={<Cpu className="h-5 w-5" />}
            title="Atomic Trade Tickets"
            description="Capital is only borrowed via a Hot Potato TradeTicket. The ticket guarantees borrowed coins must return to the policy wallet in the same transaction block."
          />
          <FeatureCard
            icon={<Database className="h-5 w-5" />}
            title="Walrus Audit Resumes"
            description="Trade logs are encrypted via Seal and written to Walrus. The resulting immutable blob hash is saved on-chain as a cryptographic trading resume."
          />
        </div>
      </div>

      {/* LP-Agent Flywheel */}
      <div
        className="mx-auto mt-16 max-w-4xl rounded-2xl p-8 relative overflow-hidden"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Brand accent line */}
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
