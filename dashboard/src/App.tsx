import { useState, useEffect } from 'react';
import { LandingPage } from './components/LandingPage';
import { AgentDashboard } from './components/AgentDashboard';
import { TimelineVisualizer, type SealEnvelope } from './components/TimelineVisualizer';
import { SealDecrypter } from './components/SealDecrypter';
import { IntentEngine } from './components/IntentEngine';
import { VolatilityStudio } from './components/VolatilityStudio';
import { EscalationInbox } from './components/EscalationInbox';
import { CloudOperatorPanel } from './components/CloudOperatorPanel';
import { Shield, LayoutDashboard, FlaskConical, Wallet, LogOut, ChevronDown, Mail, Globe, Sparkles, TrendingUp, AlertTriangle, Settings, X, CreditCard, RefreshCw } from 'lucide-react';
import type React from 'react';
import { useCurrentAccount, useDisconnectWallet, useConnectWallet, useWallets, useSuiClient } from '@mysten/dapp-kit';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { generateNonce, generateRandomness, computeZkLoginAddress } from '@mysten/sui/zklogin';

type TabType = 'landing' | 'agents' | 'intent' | 'volatility' | 'escalations' | 'operator';

export interface WalletSession {
  address: string;
  type: 'wallet' | 'zklogin_google' | 'zklogin_github';
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

  // Parse OAuth redirect parameters
  useEffect(() => {
    // 1. Google OAuth ID Token (hash redirect)
    const hash = window.location.hash;
    if (hash.includes('id_token=')) {
      try {
        const params = new URLSearchParams(hash.substring(1));
        const idToken = params.get('id_token');
        if (idToken) {
          const base64Url = idToken.split('.')[1];
          const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
          const jsonPayload = decodeURIComponent(
            window.atob(base64)
              .split('')
              .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
              .join('')
          );
          const payload = JSON.parse(jsonPayload);
          
          const googleSub = payload.sub;
          const email = payload.email || 'user@gmail.com';
          
          // Compute a real cryptographic zkLogin address on-chain from the claims using a stable salt
          const salt = BigInt(123456789012345n);
          const address = computeZkLoginAddress({
            claimName: 'sub',
            claimValue: googleSub,
            iss: 'https://accounts.google.com',
            aud: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
            userSalt: salt,
            legacyAddress: false,
          });

          const newSession: WalletSession = {
            address,
            type: 'zklogin_google',
            name: email,
            providerLabel: 'Google zkLogin',
          };
          
          setZkSession(newSession);
          localStorage.setItem('aura_zklogin_session', JSON.stringify(newSession));
          window.history.replaceState(null, '', window.location.pathname);
        }
      } catch (err) {
        console.error('Failed to parse Google zkLogin payload:', err);
      }
    }

    // 2. GitHub OAuth code (query parameter redirect)
    const searchParams = new URLSearchParams(window.location.search);
    const code = searchParams.get('code');
    if (code) {
      try {
        // Derive a deterministic mock address for demo from the code string
        const mockAddress = `0xzkL_github_${code.substring(0, 10)}3bf937ee2e95a129d1c0b392abde625`;
        const newSession: WalletSession = {
          address: mockAddress,
          type: 'zklogin_github',
          name: 'vadimcastro',
          providerLabel: 'GitHub zkLogin',
        };
        setZkSession(newSession);
        localStorage.setItem('aura_zklogin_session', JSON.stringify(newSession));
        window.history.replaceState(null, '', window.location.pathname);
      } catch (err) {
        console.error('Failed to process GitHub redirect code:', err);
      }
    }
  }, []);

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
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [showStripeOnramp, setShowStripeOnramp] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  const handleCopyWalletAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopiedWallet(true);
    setTimeout(() => setCopiedWallet(false), 2000);
  };

  useEffect(() => {
    if (!showStripeOnramp || !session?.address) return;
    
    let activeSession: any = null;
    let isMounted = true;
    
    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
          resolve();
          return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load script ${src}`));
        document.head.appendChild(script);
      });
    };

    const initStripeOnramp = async () => {
      setStripeLoading(true);
      setStripeError(null);
      
      try {
        await loadScript('https://js.stripe.com/v3/');
        await loadScript('https://crypto-js.stripe.com/crypto-onramp-outer.js');

        if (!isMounted) return;

        const stripeOnrampGlobal = (window as any).StripeOnramp;
        if (!stripeOnrampGlobal) {
          throw new Error('StripeOnramp script failed to initialize on window object.');
        }

        const daemonUrl = localStorage.getItem('aura_daemon_url') || import.meta.env.VITE_DAEMON_URL || 'http://localhost:3000';
        
        const res = await fetch(`${daemonUrl}/api/stripe/create-session`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ walletAddress: session.address }),
        });
        
        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Failed to create Stripe onramp session: ${errText || res.statusText}`);
        }
        
        const data = await res.json();
        if (!data.clientSecret) {
          throw new Error('No clientSecret returned from backend daemon.');
        }

        if (!isMounted) return;

        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || 'pk_test_51TkY23C53TDTRt9MrX2SlU50ls3sXtWLnqEO0VpBSMQFf9QfH8uMsyJ6Uv4K6qLmPFkK3aqYFyHYpP8j6rU5rSTZ00bbAmCcuo';
        const onrampInstance = stripeOnrampGlobal(publishableKey);
        
        const onrampSession = onrampInstance.createSession({
          clientSecret: data.clientSecret,
          appearance: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
          }
        });
        
        activeSession = onrampSession;
        
        if (isMounted) {
          setTimeout(() => {
            if (isMounted) {
              onrampSession.mount('#stripe-wallet-onramp-container');
              setStripeLoading(false);
            }
          }, 100);
        }
      } catch (err) {
        console.error('Stripe onramp initialization failed:', err);
        if (isMounted) {
          setStripeError((err as Error).message);
          setStripeLoading(false);
        }
      }
    };
    
    initStripeOnramp();
    
    return () => {
      isMounted = false;
      if (activeSession && typeof activeSession.unmount === 'function') {
        try {
          activeSession.unmount();
        } catch (e) {}
      }
    };
  }, [showStripeOnramp, session?.address]);

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

  // Trigger real OAuth redirect for zkLogin / OAuth providers
  const triggerZkLoginConnect = (type: WalletSession['type']) => {
    setConnectingType(type);
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    const githubClientId = import.meta.env.VITE_GITHUB_CLIENT_ID || '';
    const redirectUri = window.location.origin;

    if (type === 'zklogin_google') {
      try {
        const keypair = Ed25519Keypair.generate();
        localStorage.setItem('aura_ephemeral_privkey', keypair.getSecretKey());
        
        const randomness = generateRandomness();
        localStorage.setItem('aura_randomness', randomness);
        
        const maxEpoch = 300000;
        localStorage.setItem('aura_max_epoch', maxEpoch.toString());

        const nonce = generateNonce(keypair.getPublicKey(), maxEpoch, randomness);
        
        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${googleClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=id_token&scope=openid%20email%20profile&nonce=${nonce}`;
        
        window.location.href = authUrl;
      } catch (err) {
        console.error('Failed to trigger Google OAuth:', err);
        setConnectingType(null);
      }
    } else {
      // GitHub OAuth redirect
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${githubClientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=user`;
      window.location.href = authUrl;
    }
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
        style={{ background: 'rgba(255, 255, 255, 0.85)', backdropFilter: 'blur(12px)', borderColor: 'var(--color-border)' }}
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
                      className="absolute right-0 mt-1.5 w-56 rounded-xl border shadow-lg p-3 z-50 text-[12px] space-y-2"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
                    >
                      <div className="px-1 py-0.5 space-y-1">
                        <p className="font-bold text-[var(--color-text-primary)]">{session.providerLabel}</p>
                        <button
                          onClick={() => handleCopyWalletAddress(session.address)}
                          className="w-full text-left font-mono text-[9px] text-[var(--color-text-muted)] truncate hover:text-[var(--color-brand)] transition-colors cursor-pointer focus:outline-none border-0 bg-transparent p-0"
                          title="Click to copy address"
                        >
                          {copiedWallet ? '✓ Address Copied!' : session.address}
                        </button>
                      </div>

                      {/* Request Faucet Link */}
                      <a
                        href={`https://faucet.sui.io/?address=${session.address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-1.5 rounded-lg text-center font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 block"
                        style={{
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)',
                          background: 'var(--color-surface-2)',
                          textDecoration: 'none'
                        }}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        <span>Request Testnet SUI</span>
                      </a>

                      {/* Cetus Testnet Swap Link */}
                      <a
                        href={`https://app.cetus.zone/swap?from=0x2::sui::SUI&to=${import.meta.env.VITE_DUSDC_TYPE_TAG || '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC'}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-1.5 rounded-lg text-center font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 cursor-pointer hover:opacity-90 block"
                        style={{
                          borderColor: 'var(--color-border)',
                          color: 'var(--color-text-secondary)',
                          background: 'var(--color-surface-2)',
                          textDecoration: 'none'
                        }}
                      >
                        <RefreshCw className="h-3.5 w-3.5 text-sky-500" />
                        <span>Swap SUI on Cetus DEX</span>
                      </a>

                      {/* Fund Wallet via Stripe */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowStripeOnramp(true);
                          setShowDropdown(false);
                        }}
                        className="w-full py-1.5 rounded-lg text-center font-bold text-[10px] uppercase tracking-wider transition-all border flex items-center justify-center gap-1.5 cursor-pointer text-white bg-[var(--color-brand)] border-transparent hover:opacity-95"
                      >
                        <CreditCard className="h-3.5 w-3.5" />
                        <span>Fund with Stripe</span>
                      </button>

                      <div className="border-t" style={{ borderColor: 'var(--color-border)' }} />
                      
                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2 px-1 py-1 rounded-lg text-left font-semibold text-red-600 hover:bg-red-50 hover:text-red-700 transition-all cursor-pointer border-0 bg-transparent"
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
                      href="https://chromewebstore.google.com/detail/slush-%E2%80%94-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border text-[13px] font-semibold hover:bg-[var(--color-surface-2)] transition-all cursor-pointer text-left decoration-none block"
                      style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <Globe className="h-4 w-4 text-[var(--color-brand)]" />
                      <span>Install Slush Wallet</span>
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
              <AgentDashboard 
                onSelectAgent={handleSelectAgent} 
                activeSession={session} 
                onTriggerStripeOnramp={() => setShowStripeOnramp(true)} 
              />
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
            <IntentEngine 
              activeSession={session} 
              suiBalance={suiBalance} 
              dusdcBalance={dusdcBalance} 
            />
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

      {/* Stripe Wallet Funding Modal */}
      {showStripeOnramp && session && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div
            className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl relative"
            style={{ background: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
          >
            {/* Header */}
            <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
              <div>
                <h3 className="text-[15px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Fund via Stripe Crypto Onramp</h3>
                <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  {session.address.substring(0, 12)}…{session.address.slice(-8)}
                </p>
              </div>
              <button 
                onClick={() => setShowStripeOnramp(false)} 
                className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10 border-0 bg-transparent cursor-pointer"
              >
                <X className="h-5 w-5" style={{ color: 'var(--color-text-muted)' }} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 flex flex-col items-center">
              <div className="w-full flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Destination Wallet:</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                  {session.address.substring(0, 10)}…{session.address.slice(-6)}
                </span>
              </div>
              
              {stripeLoading && (
                <div className="py-12 flex flex-col items-center justify-center text-center w-full">
                  <div className="h-8 w-8 mb-4 border-2 border-[var(--color-brand)] border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-brand)', borderTopColor: 'transparent' }} />
                  <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>Initializing Stripe Crypto Onramp...</p>
                </div>
              )}

              {stripeError && (
                <div className="py-8 flex flex-col items-center justify-center text-center text-[var(--color-danger)] w-full">
                  <AlertTriangle className="h-8 w-8 mb-2" style={{ color: 'var(--color-danger)' }} />
                  <h4 className="text-[13px] font-bold" style={{ color: 'var(--color-danger)' }}>Failed to load Onramp</h4>
                  <p className="text-[11px] mt-1 text-[var(--color-text-secondary)]">{stripeError}</p>
                  <button 
                    onClick={() => setShowStripeOnramp(false)}
                    className="mt-4 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-[var(--color-brand)] border-0 cursor-pointer"
                  >
                    Go Back
                  </button>
                </div>
              )}

              {/* Stripe widget iframe target */}
              <div 
                id="stripe-wallet-onramp-container" 
                className={`w-full min-h-[360px] rounded-lg overflow-hidden ${stripeLoading || stripeError ? 'hidden' : ''}`}
                style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}
              />

              <button
                type="button"
                onClick={() => setShowStripeOnramp(false)}
                className="w-full py-2 rounded-lg text-[12px] font-bold transition-all border hover:bg-black/5 cursor-pointer mt-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                Close Portal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
