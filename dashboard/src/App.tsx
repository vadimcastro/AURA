import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { AgentDashboard } from './components/AgentDashboard';
import { TimelineVisualizer, type SealEnvelope } from './components/TimelineVisualizer';
import { SealDecrypter } from './components/SealDecrypter';
import { IntentEngine } from './components/IntentEngine';
import { VolatilityStudio } from './components/VolatilityStudio';
import { EscalationInbox } from './components/EscalationInbox';
import { CloudOperatorPanel } from './components/CloudOperatorPanel';
import { Shield, LayoutDashboard, FlaskConical, Wallet, LogOut, ChevronDown, Mail, Globe, Sparkles, TrendingUp, AlertTriangle, Settings } from 'lucide-react';
import type React from 'react';
import { useCurrentAccount, useDisconnectWallet, useConnectWallet, useWallets, useSuiClient } from '@mysten/dapp-kit';

type TabType = 'landing' | 'agents' | 'intent' | 'volatility' | 'escalations' | 'operator';

export interface WalletSession {
  address: string;
  type: 'wallet' | 'zklogin_google' | 'zklogin_github' | 'zklogin_apple';
  name: string;
  providerLabel: string;
}

function App() {
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return window.location.hash === '#agents' ? 'agents' : 'landing';
  });
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedBlobId, setSelectedBlobId] = useState<string | null>(null);
  const [selectedEnvelope, setSelectedEnvelope] = useState<SealEnvelope | null>(null);

  // dApp-kit wallet hooks
  const wallets = useWallets();
  const { mutate: connectWallet } = useConnectWallet();
  const currentAccount = useCurrentAccount();
  const { mutate: disconnectWallet } = useDisconnectWallet();

  // zkLogin Session state
  const [zkSession, setZkSession] = useState<WalletSession | null>(() => {
    const saved = localStorage.getItem('aura_zklogin_session');
    return saved ? JSON.parse(saved) : null;
  });

  // Effective hybrid session: prioritize real connected wallet, fallback to zkLogin
  const session: WalletSession | null = currentAccount
    ? {
        address: currentAccount.address,
        type: 'wallet',
        name: currentAccount.label || 'Browser Wallet',
        providerLabel: 'Browser Wallet',
      }
    : zkSession;

  const suiClient = useSuiClient();
  const [suiBalance, setSuiBalance] = useState<string | null>(null);
  const [dusdcBalance, setDusdcBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.address) {
      setSuiBalance(null);
      setDusdcBalance(null);
      return;
    }

    const fetchBalances = async () => {
      try {
        const suiBal = await suiClient.getBalance({ owner: session.address });
        const dusdcBal = await suiClient.getBalance({
          owner: session.address,
          coinType: import.meta.env.VITE_DUSDC_TYPE_TAG || '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC',
        });
        setSuiBalance((parseFloat(suiBal.totalBalance) / 1e9).toFixed(3));
        setDusdcBalance((parseFloat(dusdcBal.totalBalance) / 1e6).toFixed(2));
      } catch (err) {
        console.warn('Failed to fetch user wallet balances:', err);
      }
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [session?.address, suiClient]);

  const [showConnectModal, setShowConnectModal] = useState(false);
  const [connectingType, setConnectingType] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Sync hash to state changes
  useEffect(() => {
    window.location.hash = activeTab;
  }, [activeTab]);

  const handleSelectAgent = (agentAddress: string, blobId: string | null) => {
    setSelectedAgent(agentAddress);
    setSelectedBlobId(blobId);
    setSelectedEnvelope(null);
    setTimeout(() => {
      document.getElementById('timeline-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSelectEnvelope = (envelope: SealEnvelope) => {
    setSelectedEnvelope(envelope);
    setTimeout(() => {
      document.getElementById('decryption-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  // Simulate authentication loading flow for zkLogin
  const triggerZkLoginConnect = (type: WalletSession['type']) => {
    setConnectingType(type);
    setTimeout(() => {
      let newSession: WalletSession;
      if (type === 'zklogin_google') {
        newSession = {
          address: '0xzkL_google_ded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676',
          type,
          name: 'vadim.castro@gmail.com',
          providerLabel: 'Google zkLogin',
        };
      } else if (type === 'zklogin_github') {
        newSession = {
          address: '0xzkL_github_3bf937ee2e95a129d1c0b392abde62551cf16757041a96f2ba1443f676ffb6a8',
          type,
          name: 'vadimcastro',
          providerLabel: 'GitHub zkLogin',
        };
      } else {
        newSession = {
          address: '0xzkL_apple_74093b562d7d979a962336854234d1d6962417b17bad4543ed6e85e339fd7cef',
          type,
          name: 'vadim.castro@icloud.com',
          providerLabel: 'Apple zkLogin',
        };
      }
      setZkSession(newSession);
      localStorage.setItem('aura_zklogin_session', JSON.stringify(newSession));
      setConnectingType(null);
      setShowConnectModal(false);
    }, 1200);
  };

  const handleDisconnect = () => {
    if (currentAccount) {
      disconnectWallet();
    }
    setZkSession(null);
    localStorage.removeItem('aura_zklogin_session');
    setShowDropdown(false);
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
        <div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">

            {/* Left: Logo & Nav tabs */}
            <div className="flex items-center gap-8">
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

              <nav className="flex items-center gap-1" aria-label="Main navigation">
                {navBtn('landing', 'Overview', LayoutDashboard)}
                {navBtn('agents', 'Audit Studio', FlaskConical)}
                {navBtn('intent', 'Intent Engine', Sparkles)}
                {navBtn('volatility', 'Volatility Surface', TrendingUp)}
                {navBtn('escalations', 'Escalations', AlertTriangle)}
                {navBtn('operator', 'Operator Console', Settings)}
              </nav>
            </div>

            {/* Right: Unified Wallet / zkLogin connection controller */}
            <div className="relative flex items-center gap-3">
              {session && (suiBalance !== null || dusdcBalance !== null) && (
                <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-xl border text-[11px] font-semibold font-mono" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  {suiBalance !== null && (
                    <span>
                      {suiBalance} SUI
                    </span>
                  )}
                  {suiBalance !== null && dusdcBalance !== null && (
                    <span className="w-px h-3 bg-[var(--color-border)]" />
                  )}
                  {dusdcBalance !== null && (
                    <span className="text-[var(--color-brand)] font-bold">
                      {dusdcBalance} dUSDC
                    </span>
                  )}
                </div>
              )}
              {session ? (
                <div className="relative">
                  <button
                    onClick={() => setShowDropdown(prev => !prev)}
                    className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-[12px] font-semibold transition-all cursor-pointer bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                  >
                    <span className="h-2 w-2 rounded-full bg-[var(--color-success)]" />
                    <span>{session.name}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                  </button>
                  {showDropdown && (
                    <div
                      className="absolute right-0 mt-1.5 w-56 rounded-xl border shadow-lg p-2.5 z-50 text-[12px] space-y-2"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                    >
                      <div className="px-2 py-1">
                        <p className="font-bold text-[var(--color-text-primary)]">{session.providerLabel}</p>
                        <p className="font-mono text-[9px] text-[var(--color-text-muted)] truncate select-all" title="Click to select all">
                          {session.address}
                        </p>
                      </div>
                      <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />
                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all cursor-pointer"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        Disconnect Wallet
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => setShowConnectModal(true)}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-xl text-[12px] font-bold text-white bg-[var(--color-brand)] shadow-sm hover:opacity-90 transition-all cursor-pointer"
                >
                  <Wallet className="h-3.5 w-3.5" />
                  Connect Account
                </button>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Connection Modal */}
      {showConnectModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-sm rounded-2xl border p-6 shadow-2xl relative"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            <h3 className="text-[15px] font-bold uppercase tracking-wider text-center mb-6" style={{ color: 'var(--color-text-primary)' }}>
              Unified Onboarding System
            </h3>

            {connectingType ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-4">
                <div className="spinner h-8 w-8" />
                <p className="text-[12px] font-semibold text-[var(--color-text-secondary)] animate-pulse">
                  {connectingType === 'wallet' ? 'Connecting to browser extension...' : 'Spawning secure zkLogin session...'}
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Traditional Wallets */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider pl-1" style={{ color: 'var(--color-text-muted)' }}>
                    Traditional Web3 Wallets
                  </p>
                  {wallets.length === 0 ? (
                    <a
                      href="https://chrome.google.com/webstore/detail/sui-wallet/opffaplhgoihhhacieghomeooapaakcb"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left decoration-none block"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <Globe className="h-4 w-4 text-[var(--color-brand)]" />
                      <span>Install Sui Wallet</span>
                    </a>
                  ) : (
                    wallets.map((wallet) => (
                      <button
                        key={wallet.name}
                        onClick={() => {
                          setConnectingType('wallet');
                          connectWallet(
                            { wallet },
                            {
                              onSuccess: () => {
                                setConnectingType(null);
                                setShowConnectModal(false);
                              },
                              onError: () => {
                                setConnectingType(null);
                              },
                            }
                          );
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left"
                        style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                      >
                        {wallet.icon ? (
                          <img src={wallet.icon} alt={wallet.name} className="h-4 w-4" />
                        ) : (
                          <Globe className="h-4 w-4 text-[var(--color-brand)]" />
                        )}
                        <span>{wallet.name}</span>
                      </button>
                    ))
                  )}
                </div>

                {/* Social zkLogin */}
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider pl-1" style={{ color: 'var(--color-text-muted)' }}>
                    Social Web2 zkLogin
                  </p>
                  <button
                    onClick={() => triggerZkLoginConnect('zklogin_google')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    <Mail className="h-4 w-4 text-red-500" />
                    <span>Sign in with Google</span>
                  </button>
                  <button
                    onClick={() => triggerZkLoginConnect('zklogin_github')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    <Mail className="h-4 w-4 text-indigo-500" />
                    <span>Sign in with GitHub</span>
                  </button>
                  <button
                    onClick={() => triggerZkLoginConnect('zklogin_apple')}
                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left"
                    style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    <span className="text-[13px] font-bold pl-0.5 pr-0.5"></span>
                    <span>Sign in with Apple</span>
                  </button>
                </div>

                <div className="pt-2 border-t text-center" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    onClick={() => setShowConnectModal(false)}
                    className="text-[12px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 pb-24 pt-2">
        {activeTab === 'landing' && (
          <LandingPage onNavigate={(tab) => setActiveTab(tab as TabType)} />
        )}
        {activeTab === 'agents' && (
          <div className="space-y-10">
            <section className="pt-6">
              <AgentDashboard onSelectAgent={handleSelectAgent} activeSession={session} />
            </section>

            {selectedAgent && (
              <div id="timeline-section" className="grid gap-8 lg:grid-cols-2 items-start pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
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
        {activeTab === 'intent' && (
          <section className="pt-6">
            <IntentEngine activeSession={session} />
          </section>
        )}
        {activeTab === 'volatility' && (
          <section className="pt-6">
            <VolatilityStudio />
          </section>
        )}
        {activeTab === 'escalations' && (
          <section className="pt-6">
            <EscalationInbox />
          </section>
        )}
        {activeTab === 'operator' && (
          <section className="pt-6">
            <CloudOperatorPanel />
          </section>
        )}
      </main>

      {/* Footer */}
      <footer
        className="border-t py-8 text-center"
        style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface)' }}
      >
        <div className="mx-auto max-w-[1600px] px-4">
          <p className="text-xs text-[var(--color-text-muted)]">© {new Date().getFullYear()} AURA Protocol. Immutably Secured AgentFi on Sui.</p>
          <p className="mt-1.5 text-[11px] font-mono text-[var(--color-text-muted)] opacity-60">
            Testnet Contract: {import.meta.env.VITE_AURA_PACKAGE_ID || '0x7cb617c78407fdae14a8e51f12da5cd7c7abf2dc67f6c0c58c5fdb8ce40dd922'}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
