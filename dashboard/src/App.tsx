import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { AgentDashboard } from './components/AgentDashboard';
import { TimelineVisualizer, type SealEnvelope } from './components/TimelineVisualizer';
import { SealDecrypter } from './components/SealDecrypter';
import { Shield, LayoutDashboard, FlaskConical } from 'lucide-react';
import type React from 'react';

type TabType = 'landing' | 'agents';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('landing');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedBlobId, setSelectedBlobId] = useState<string | null>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<SealEnvelope | null>(null);

  const handleSelectAgent = (agentAddress: string, blobId: string | null) => {
    setSelectedAgent(agentAddress);
    setSelectedBlobId(blobId);
    setSelectedEnvelope(null);
  };

  const handleSelectEnvelope = (envelope: SealEnvelope) => {
    setSelectedEnvelope(envelope);
    setTimeout(() => {
      document.getElementById('decryption-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const navBtn = (tab: TabType, label: string, Icon: React.ComponentType<{ className?: string }>) => (
    <button
      onClick={() => {
        setActiveTab(tab);
        if (tab === 'landing') {
          setSelectedAgent(null);
          setSelectedBlobId(null);
          setSelectedEnvelope(null);
        }
      }}
      aria-current={activeTab === tab ? 'page' : undefined}
      className={[
        'flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 cursor-pointer',
        activeTab === tab
          ? 'bg-[var(--color-brand-light)] text-[var(--color-brand)] font-semibold'
          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-2)]',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen" style={{ background: 'var(--color-bg)', color: 'var(--color-text-primary)' }}>

      {/* Subtle top gradient accent */}
      <div className="fixed top-0 inset-x-0 h-1 bg-gradient-to-r from-[#4f6ef7] via-[#818cf8] to-[#4f6ef7] z-50" />

      {/* Navigation Header */}
      <header
        className="sticky top-1 z-40 border-b"
        style={{ background: 'rgba(248,249,252,0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--color-border)' }}
      >
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">

            {/* Logo */}
            <button
              onClick={() => setActiveTab('landing')}
              className="flex items-center gap-2.5 cursor-pointer group"
              aria-label="AURA Protocol home"
            >
              <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--color-brand)] text-white shadow-sm shadow-[var(--color-brand)]/30 group-hover:opacity-90 transition-opacity">
                <Shield className="h-4 w-4" />
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[15px] font-bold tracking-tight text-[var(--color-text-primary)]">AURA</span>
                <span className="text-[11px] font-medium text-[var(--color-text-muted)] uppercase tracking-widest">Protocol</span>
              </div>
            </button>

            {/* Nav tabs */}
            <nav className="flex items-center gap-1" aria-label="Main navigation">
              {navBtn('landing', 'Overview', LayoutDashboard)}
              {navBtn('agents', 'Audit Studio', FlaskConical)}
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-24 pt-2">
        {activeTab === 'landing' ? (
          <LandingPage onNavigate={(tab) => setActiveTab(tab as TabType)} />
        ) : (
          <div className="space-y-10">
            <section className="pt-6">
              <AgentDashboard onSelectAgent={handleSelectAgent} />
            </section>

            {selectedAgent && (
              <div className="grid gap-8 lg:grid-cols-2 items-start pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <section>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Timeline Inspector</p>
                  <TimelineVisualizer
                    agentAddress={selectedAgent}
                    blobId={selectedBlobId}
                    onSelectEnvelope={handleSelectEnvelope}
                  />
                </section>

                <section id="decryption-section">
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Decryption Sandbox</p>
                  <SealDecrypter envelope={selectedEnvelope} />
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="mx-auto max-w-6xl px-4">
          <p className="text-xs text-[var(--color-text-muted)]">© {new Date().getFullYear()} AURA Protocol. Immutably Secured AgentFi on Sui.</p>
          <p className="mt-1.5 text-[11px] font-mono text-[var(--color-text-muted)] opacity-60">
            Testnet Contract: 0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
