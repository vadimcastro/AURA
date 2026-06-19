import React, { useState } from 'react';
import { X, Zap, Lock, DollarSign, Activity, AlertTriangle, Users } from 'lucide-react';

export interface AgentSettingsModalProps {
  agentAddress: string;
  currentStake: number;
  isActive: boolean;
  availableAgents?: { address: string; label: string }[];
  onClose: () => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  agentAddress,
  currentStake,
  availableAgents = [],
  onClose,
}) => {
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [strategyMode, setStrategyMode] = useState<'preset' | 'copy'>('preset');
  const [riskLevel, setRiskLevel] = useState<number>(50); // 25 = Conservative, 50 = Balanced, 75 = Aggressive
  const [copyTargetAddress, setCopyTargetAddress] = useState<string>('');
  const [isSimulating, setIsSimulating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

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
      setTimeout(() => onClose(), 2000);
    }, 1500);
  };

  const handleLiquidate = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setIsSimulating(false);
      setSuccessMsg('Agent liquidated and funds returned to wallet.');
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
            <h3 className="text-[15px] font-bold" style={{ color: 'var(--color-text-primary)' }}>Agent Configuration</h3>
            <p className="text-[11px] font-mono mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
              {agentAddress.substring(0, 12)}…{agentAddress.slice(-8)}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10">
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
          ) : (
            <>
              {/* Capital Management */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
                  <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Capital Management</h4>
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
              </div>

              {/* Strategy Mode Switcher */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" style={{ color: 'var(--color-brand)' }} />
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">Execution Strategy</h4>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-neutral-100 border" style={{ borderColor: 'var(--color-border)' }}>
                  <button
                    type="button"
                    onClick={() => setStrategyMode('preset')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all ${strategyMode === 'preset' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
                  >
                    Trading Style Preset
                  </button>
                  <button
                    type="button"
                    onClick={() => setStrategyMode('copy')}
                    className={`py-1.5 rounded-md text-[12px] font-semibold transition-all ${strategyMode === 'copy' ? 'bg-white shadow-sm text-neutral-900' : 'text-neutral-500'}`}
                  >
                    Copy Trade Profile
                  </button>
                </div>
              </div>

              {/* Conditional Strategy Controls */}
              {strategyMode === 'preset' ? (
                /* Cleaner Risk Slider */
                <div className="space-y-4">
                  <div className="flex justify-between items-center text-[12px] font-semibold text-neutral-700">
                    <span>Target Risk Setting:</span>
                    <span className="font-mono text-neutral-900 px-2 py-0.5 bg-neutral-100 rounded">{getRiskLabel(riskLevel)}</span>
                  </div>
                  <div className="relative pt-1">
                    <input 
                      type="range" 
                      min="25" 
                      max="75" 
                      step="25"
                      value={riskLevel}
                      onChange={(e) => setRiskLevel(parseInt(e.target.value))}
                      className="w-full h-1 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
                    />
                    <div className="flex justify-between mt-2 text-[10px] font-semibold text-neutral-400 uppercase tracking-wide">
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
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400 flex items-center gap-1.5">
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
                          {a.label} ({a.address.substring(0, 10)}…)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="relative flex py-2 items-center">
                    <div className="flex-grow border-t border-neutral-200"></div>
                    <span className="flex-shrink mx-4 text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Or Paste Custom Profile</span>
                    <div className="flex-grow border-t border-neutral-200"></div>
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
                <div className="flex items-center justify-between p-3 rounded-xl border border-red-200 bg-red-50">
                  <div>
                    <h4 className="text-[12px] font-bold text-red-700">Danger Zone</h4>
                    <p className="text-[11px] text-red-600">Liquidate agent and return funds.</p>
                  </div>
                  <button 
                    onClick={handleLiquidate}
                    disabled={isSimulating}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white uppercase tracking-wide flex items-center gap-1 hover:opacity-90 transition-opacity bg-red-600 cursor-pointer"
                  >
                    <AlertTriangle className="h-3 w-3" /> Liquidate
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!successMsg && (
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
