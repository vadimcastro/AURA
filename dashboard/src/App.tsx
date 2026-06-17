import { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { AgentDashboard } from './components/AgentDashboard';
import { TimelineVisualizer } from './components/TimelineVisualizer';
import { SealDecrypter } from './components/SealDecrypter';
import { Shield, LayoutDashboard, FileSpreadsheet } from 'lucide-react';

type TabType = 'landing' | 'agents';

function App() {
  const [activeTab, setActiveTab] = useState<TabType>('landing');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedBlobId, setSelectedBlobId] = useState<string | null>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<any | null>(null);

  const handleSelectAgent = (agentAddress: string, blobId: string | null) => {
    setSelectedAgent(agentAddress);
    setSelectedBlobId(blobId);
    setSelectedEnvelope(null); // Clear active decryption when selecting new agent
  };

  const handleSelectEnvelope = (envelope: any) => {
    setSelectedEnvelope(envelope);
    // Smooth scroll down to decryption engine on selection
    setTimeout(() => {
      const decrypterEl = document.getElementById('decryption-section');
      if (decrypterEl) {
        decrypterEl.scrollIntoView({ behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-[#07080e] text-slate-300 font-sans selection:bg-purple-500/30 selection:text-white">
      {/* Background pattern */}
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#08090f_1px,transparent_1px),linear-gradient(to_bottom,#08090f_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-10" />

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('landing')}>
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-md shadow-purple-500/20">
                <Shield className="h-5 w-5" />
              </div>
              <span className="text-xl font-bold tracking-tight text-white">
                AURA <span className="text-purple-400 font-medium text-sm">Protocol</span>
              </span>
            </div>

            <nav className="flex items-center gap-1">
              <button
                onClick={() => {
                  setActiveTab('landing');
                  setSelectedAgent(null);
                  setSelectedBlobId(null);
                  setSelectedEnvelope(null);
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-300 cursor-pointer ${
                  activeTab === 'landing'
                    ? 'bg-white/5 text-white border border-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                Overview
              </button>
              <button
                onClick={() => setActiveTab('agents')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-300 cursor-pointer ${
                  activeTab === 'agents'
                    ? 'bg-white/5 text-white border border-white/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Audit Studio
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pb-24">
        {activeTab === 'landing' ? (
          <LandingPage onNavigate={(tab) => setActiveTab(tab as TabType)} />
        ) : (
          <div className="space-y-12">
            {/* Agent Comparison Section */}
            <section className="pt-6">
              <AgentDashboard onSelectAgent={handleSelectAgent} />
            </section>

            {/* Timeline & Decrypter Grid */}
            {selectedAgent && (
              <div className="grid gap-8 lg:grid-cols-2 items-start border-t border-white/5 pt-12">
                <section>
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Timeline Inspector</h4>
                  </div>
                  <TimelineVisualizer
                    agentAddress={selectedAgent}
                    blobId={selectedBlobId}
                    onSelectEnvelope={handleSelectEnvelope}
                  />
                </section>

                <section id="decryption-section">
                  <div className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Decryption Sandbox</h4>
                  </div>
                  <SealDecrypter envelope={selectedEnvelope} />
                </section>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#090a10] py-8 text-center text-xs text-slate-500">
        <div className="mx-auto max-w-6xl px-4">
          <p>© {new Date().getFullYear()} AURA Protocol. Immutably Secured AgentFi.</p>
          <p className="mt-1.5 text-slate-600">Sui Testnet Contract: 0x74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
