import React, { useState, useEffect } from 'react';
import { X, Zap, Lock, DollarSign, Activity, AlertTriangle, Users, CreditCard } from 'lucide-react';

export interface AgentSettingsModalProps {
  agentAddress: string;
  currentStake: number;
  isActive: boolean;
  availableAgents?: { address: string; label: string }[];
  onClose: () => void;
  initialStrategyMode?: 'preset' | 'copy';
  initialRiskLevel?: number;
  initialCopyTarget?: string;
  onSave?: (settings: {
    depositAmount?: number;
    strategyMode: 'preset' | 'copy';
    riskLevel: number;
    copyTargetAddress: string;
  }) => void;
  onLiquidate?: () => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  agentAddress,
  currentStake,
  availableAgents = [],
  onClose,
  initialStrategyMode = 'preset',
  initialRiskLevel = 50,
  initialCopyTarget = '',
  onSave,
  onLiquidate,
}) => {
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [strategyMode, setStrategyMode] = useState<'preset' | 'copy'>(initialStrategyMode);
  const [riskLevel, setRiskLevel] = useState<number>(initialRiskLevel); // 25 = Conservative, 50 = Balanced, 75 = Aggressive
  const [copyTargetAddress, setCopyTargetAddress] = useState<string>(initialCopyTarget);
  const [isSimulating, setIsSimulating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showStripe, setShowStripe] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);

  useEffect(() => {
    if (!showStripe) return;
    
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
          body: JSON.stringify({ walletAddress: agentAddress }),
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
        
        const session = onrampInstance.createSession({
          clientSecret: data.clientSecret,
          appearance: {
            theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light'
          }
        });
        
        activeSession = session;
        
        if (isMounted) {
          setTimeout(() => {
            if (isMounted) {
              session.mount('#stripe-onramp-container');
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
  }, [showStripe, agentAddress]);

  const getRiskLabel = (val: number) => {
    if (val <= 33) return 'Conservative';
    if (val <= 66) return 'Balanced';
    return 'Aggressive';
  };

  const handleSave = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSuccessMsg('Policy updated on-chain successfully.');
      if (onSave) {
        onSave({
          depositAmount: depositAmount ? parseFloat(depositAmount) : undefined,
          strategyMode,
          riskLevel,
          copyTargetAddress,
        });
      }
      setTimeout(() => onClose(), 2000);
    }, 1500);
  };

  const handleLiquidate = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSuccessMsg('Agent liquidated and funds returned to wallet.');
      if (onLiquidate) {
        onLiquidate();
      }
      setTimeout(() => onClose(), 2000);
    }, 1500);
  };

  const filteredCopyAgents = availableAgents.filter(
    (a) => a.address.toLowerCase() !== agentAddress.toLowerCase()
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-all">
      <div 
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl relative"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between border-b" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
          <div>
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--color-text-primary)' }}>
              {showStripe ? 'Fund via Stripe' : 'Agent Configuration'}
            </h3>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {agentAddress.substring(0, 12)}…{agentAddress.slice(-8)}
            </p>
          </div>
          <button onClick={showStripe ? () => setShowStripe(false) : onClose} className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10">
            <X className="h-5 w-5" style={{ color: 'var(--color-text-muted)' }} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {successMsg ? (
            <div className="py-12 flex flex-col items-center justify-center text-center">
              <div className="h-12 w-12 rounded-full mb-4 flex items-center justify-center" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                <Lock className="h-6 w-6" />
              </div>
              <h4 className="text-[15px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Transaction Confirmed</h4>
              <p className="text-[13px] mt-1" style={{ color: 'var(--color-text-secondary)' }}>{successMsg}</p>
            </div>
          ) : showStripe ? (
            <div className="space-y-4 flex flex-col items-center">
              <div className="w-full flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
                <span className="text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Destination Wallet:</span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>
                  {agentAddress.substring(0, 10)}…{agentAddress.slice(-6)}
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
                    onClick={() => setShowStripe(false)}
                    className="mt-4 px-3 py-1.5 rounded-lg text-[11px] font-bold text-white bg-[var(--color-brand)]"
                  >
                    Go Back
                  </button>
                </div>
              )}

              {/* Stripe widget iframe target */}
              <div 
                id="stripe-onramp-container" 
                className={`w-full min-h-[360px] rounded-lg overflow-hidden ${stripeLoading || stripeError ? 'hidden' : ''}`}
                style={{ border: '1px solid var(--color-border)', background: 'var(--color-surface-2)' }}
              />

              <button
                type="button"
                onClick={() => setShowStripe(false)}
                className="w-full py-2 rounded-lg text-[12px] font-bold transition-all border hover:bg-black/5 cursor-pointer mt-2"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              >
                Back to Settings
              </button>
            </div>
          ) : (
            <>
              {/* Capital Management */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Capital Management</h4>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="number"
                      min="0"
                      placeholder="Deposit dUSDC"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none transition-all focus:ring-2 focus:ring-[var(--color-brand)]"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                  <button 
                    className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all shadow-sm hover:opacity-90"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    Withdraw {currentStake > 0 ? `${currentStake.toFixed(2)} SUI` : 'All'}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowStripe(true)}
                  className="w-full py-2 rounded-lg text-[12px] font-bold transition-all flex items-center justify-center gap-2 border hover:bg-black/5 cursor-pointer"
                  style={{ borderColor: '#635bff', color: '#635bff', background: 'rgba(99, 91, 255, 0.07)' }}
                >
                  <CreditCard className="h-3.5 w-3.5" />
                  <span>Fund with Stripe Crypto Onramp</span>
                </button>
              </div>

              {/* Strategy Mode Switcher */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Execution Strategy</h4>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setStrategyMode('preset')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${strategyMode === 'preset' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    Trading Style Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategyMode('copy')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all cursor-pointer ${strategyMode === 'copy' ? 'bg-[var(--color-surface)] shadow-sm text-[var(--color-text-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'}`}
                  >
                    Copy Trade Profile
                  </button>
                </div>
              </div>

              {/* Conditional Strategy Controls */}
              {/* Supported Actions Description */}
              <div 
                className="p-3 mb-4 rounded-xl border text-[10px] space-y-1.5 leading-relaxed" 
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

              {strategyMode === 'preset' ? (
                /* Cleaner Risk Slider */
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[12px] font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                    <span>Target Risk Setting:</span>
                    <span className="font-mono px-2 py-0.5 rounded border" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}>{getRiskLabel(riskLevel)}</span>
                  </div>
                  <div className="relative pt-1">
                    <input 
                      type="range" 
                      min="25" 
                      max="75" 
                      step="25"
                      value={riskLevel}
                      onChange={(e) => setRiskLevel(parseInt(e.target.value))}
                      className="w-full h-1 rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                      style={{ background: 'var(--color-border)' }}
                    />
                    <div className="flex justify-between mt-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                      <span>Conservative</span>
                      <span>Balanced</span>
                      <span>Aggressive</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* Copy Trading Selector with Defaults */
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[11px] font-semibold uppercase tracking-wider flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
                      <Users className="h-3 w-3" /> Select Top Performing Agent to Copy
                    </label>
                    <select
                      value={copyTargetAddress}
                      onChange={(e) => setCopyTargetAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-[13px] outline-none transition-all focus:ring-2 focus:ring-[var(--color-brand)]"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    >
                      <option value="">-- Choose from top rank --</option>
                      {filteredCopyAgents.map((a) => (
                        <option key={a.address} value={a.address}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t" style={{ borderColor: 'var(--color-border)' }}></div>
                    <span className="flex-shrink mx-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Or Paste Custom Profile</span>
                    <div className="flex-grow border-t" style={{ borderColor: 'var(--color-border)' }}></div>
                  </div>

                  <div className="space-y-2">
                    <input
                      type="text"
                      placeholder="Paste Sui Address or SuiNS (e.g. trader.sui)"
                      value={copyTargetAddress}
                      onChange={(e) => setCopyTargetAddress(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-lg text-[13px] outline-none transition-all focus:ring-2 focus:ring-[var(--color-brand)]"
                      style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                    />
                  </div>
                </div>
              )}

              {/* Danger Zone */}
              <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between p-3 rounded-xl border" style={{ background: 'var(--color-danger-bg)', borderColor: 'rgba(239, 68, 68, 0.2)' }}>
                  <div>
                    <h4 className="text-[12px] font-bold" style={{ color: 'var(--color-danger)' }}>Danger Zone</h4>
                    <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>Liquidate agent and return funds.</p>
                  </div>
                  <button 
                    onClick={handleLiquidate}
                    disabled={isSimulating}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white uppercase tracking-wide flex items-center gap-1 hover:opacity-90 transition-opacity cursor-pointer"
                    style={{ background: 'var(--color-danger)' }}
                  >
                    <AlertTriangle className="h-3 w-3" /> Liquidate
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!successMsg && !showStripe && (
          <div className="px-6 py-4 flex justify-end gap-3 border-t" style={{ borderColor: 'var(--color-border)', background: 'var(--color-surface-2)' }}>
            <button 
              onClick={onClose}
              disabled={isSimulating}
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all cursor-pointer"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSimulating}
              className="px-5 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all disabled:opacity-50 cursor-pointer text-white bg-[var(--color-brand)]"
            >
              {isSimulating ? (
                <>
                  <div className="spinner h-3 w-3" />
                  Updating...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Save Policy
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
