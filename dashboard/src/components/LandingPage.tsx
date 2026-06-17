import React from 'react';
import { Shield, Database, ArrowRight, Cpu } from 'lucide-react';

interface StatsProps {
  label: string;
  value: string;
  subtext: string;
}

const StatCard: React.FC<StatsProps> = ({ label, value, subtext }) => (
  <div className="relative overflow-hidden rounded-2xl border border-white/5 bg-slate-900/50 p-6 backdrop-blur-xl transition-all duration-300 hover:border-purple-500/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.15)]">
    <div className="absolute top-0 right-0 h-24 w-24 bg-gradient-to-br from-purple-500/5 to-cyan-500/5 blur-2xl" />
    <p className="text-sm font-medium text-slate-400">{label}</p>
    <p className="mt-2 text-3xl font-bold tracking-tight text-white">{value}</p>
    <p className="mt-1 text-xs text-purple-400">{subtext}</p>
  </div>
);

interface FeatureProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureProps> = ({ icon, title, description }) => (
  <div className="group relative rounded-2xl border border-white/5 bg-slate-900/40 p-6 backdrop-blur-xl transition-all duration-300 hover:border-cyan-500/20 hover:bg-slate-900/60">
    <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 ring-1 ring-purple-500/20 group-hover:bg-cyan-500/10 group-hover:text-cyan-400 group-hover:ring-cyan-500/20 transition-all duration-300">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-white group-hover:text-cyan-300 transition-colors duration-300">{title}</h3>
    <p className="mt-2 text-sm leading-relaxed text-slate-400">{description}</p>
  </div>
);

interface LandingPageProps {
  onNavigate: (tab: string) => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onNavigate }) => {
  return (
    <div className="relative min-h-[calc(100vh-100px)] py-12">
      {/* Glow Effects */}
      <div className="absolute top-1/4 left-1/4 -z-10 h-96 w-96 rounded-full bg-purple-500/10 blur-[120px]" />
      <div className="absolute bottom-1/4 right-1/4 -z-10 h-96 w-96 rounded-full bg-cyan-500/10 blur-[120px]" />

      {/* Hero Section */}
      <div className="mx-auto max-w-4xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-500/5 px-4 py-1.5 text-xs font-semibold text-purple-300 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
          </span>
          AURA AgentFi Security Layer Live on Sui Testnet
        </div>
        
        <h1 className="mt-8 text-4xl font-extrabold tracking-tight text-white sm:text-6xl bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
          Autonomous Reputation &amp;<br />
          <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent">
            User Risk Assurance
          </span>
        </h1>
        
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-400">
          AURA secures on-chain delegated capital for autonomous DeFi agents. Through Move-enforced sandboxes and Walrus audit resume networks, we eliminate agent trust risk.
        </p>

        <div className="mt-10 flex items-center justify-center gap-4">
          <button
            onClick={() => onNavigate('agents')}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-500/25 hover:from-purple-500 hover:to-indigo-500 hover:shadow-purple-500/35 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 focus:ring-offset-slate-950 cursor-pointer"
          >
            Launch Audit Studio
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </button>
          <a
            href="https://github.com/vadimcastro/A.U.R.A"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-all duration-300 cursor-pointer"
          >
            Explore Github
          </a>
        </div>
      </div>

      {/* Protocol Stats */}
      <div className="mx-auto mt-20 max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-3">
          <StatCard
            label="Total Protected Capacity"
            value="150,000 dUSDC"
            subtext="Available testnet liquidity ceiling"
          />
          <StatCard
            label="Verified Agents"
            value="2 Active"
            subtext="0.01 SUI collateral bonds locked"
          />
          <StatCard
            label="Telemetry Audits"
            value="1,842 Blobs"
            subtext="Immutably synced on Walrus"
          />
        </div>
      </div>

      {/* Core Mechanics / Features */}
      <div className="mx-auto mt-24 max-w-5xl">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white">How AURA Protects Your Capital</h2>
          <p className="mt-4 text-slate-400">
            A three-tier trust architecture separating execution authority, capital constraints, and performance proof.
          </p>
        </div>

        <div className="mt-12 grid gap-8 md:grid-cols-3">
          <FeatureCard
            icon={<Shield className="h-6 w-6" />}
            title="Move VM Sandboxes"
            description="LPs delegate funds inside a custom WalletPolicy wallet. The Move VM strictly limits transaction budgets, expiration blocks, and allowlisted target smart contracts."
          />
          <FeatureCard
            icon={<Cpu className="h-6 w-6" />}
            title="Atomic Trade Tickets"
            description="Capital can only be borrowed via an atomic Hot Potato TradeTicket. The ticket guarantees that the borrowed coins must return to the policy wallet by the end of the transaction block."
          />
          <FeatureCard
            icon={<Database className="h-6 w-6" />}
            title="Walrus Audit Resumes"
            description="Agent trade logs are encrypted locally via Seal and written to Walrus. The resulting immutable blob hash is saved on-chain to form a cryptographic trading resume."
          />
        </div>
      </div>

      {/* Flow Diagram Banner */}
      <div className="mx-auto mt-24 max-w-5xl rounded-3xl border border-white/5 bg-slate-950/40 p-8 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
        <div className="grid gap-8 md:grid-cols-2 items-center">
          <div>
            <h3 className="text-2xl font-bold text-white">The LP-Agent Flywheel</h3>
            <p className="mt-4 text-slate-400 leading-relaxed">
              AURA aligns the incentives of liquidity providers and agent developers. Agents gain access to capital by proving their strategy constraints, while LPs retain complete control and ownership over the safety limits and slash events.
            </p>
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 font-bold text-xs">1</span>
                LP configures constraints &amp; deposits dUSDC.
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 font-bold text-xs">2</span>
                Agent registers, stakes SUI, and requests capital.
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-400 font-bold text-xs">3</span>
                Agent executes trades on-chain and uploads logs to Walrus.
              </div>
            </div>
          </div>
          
          <div className="relative rounded-2xl border border-white/5 bg-slate-900/60 p-6 flex flex-col justify-between aspect-video select-none">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono text-cyan-400">STATUS: ACTIVE_LOOP</span>
              <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            </div>
            
            <div className="my-4 space-y-3 font-mono text-xs text-slate-300">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Agent Staked Bond:</span>
                <span className="text-purple-300">0.01 SUI</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Active TVL Cap:</span>
                <span className="text-purple-300">1,000.00 dUSDC</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Registered target:</span>
                <span className="text-cyan-300">DeepBook Predict</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Last Telemetry:</span>
                <span className="text-cyan-300">Walrus: xyfwRUYq...</span>
              </div>
            </div>

            <button
              onClick={() => onNavigate('agents')}
              className="w-full py-2.5 rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300 font-semibold text-xs tracking-wide hover:bg-purple-500/20 transition-all duration-300"
            >
              INSPECT LIVE REGISTRY
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
