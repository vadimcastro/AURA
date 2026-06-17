import React, { useState } from 'react';
import { X, Zap, Lock, DollarSign, Activity, AlertTriangle } from 'lucide-react';

export interface AgentSettingsModalProps {
  agentAddress: string;
  currentStake: number;
  isActive: boolean;
  onClose: () => void;
}

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({
  agentAddress,
  currentStake,
  onClose,
}) => {
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [riskLevel, setRiskLevel] = useState<number>(50);
  const [isSimulating, setIsSimulating] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSave = () => {
    setIsSimulating(true);
    // Simulate a Sui PTB transaction delay
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
                  <h4 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Capital Management</h4>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    placeholder={`Deposit dUSDC (Max 450)`}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg text-[13px] outline-none transition-all"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  />
                  <button 
                    className="px-4 py-2 rounded-lg text-[12px] font-bold transition-all"
                    style={{ background: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                  >
                    Withdraw {currentStake > 0 ? `${currentStake.toFixed(2)} SUI` : 'All'}
                  </button>
                </div>
              </div>

              {/* Risk Slider */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4" style={{ color: 'var(--color-warning)' }} />
                  <h4 className="text-[13px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-secondary)' }}>Risk Tolerance</h4>
                </div>
                <div>
                  <input 
                    type="range" 
                    min="10" 
                    max="90" 
                    value={riskLevel}
                    onChange={(e) => setRiskLevel(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
                  />
                  <div className="flex justify-between mt-2 text-[11px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Conservative</span>
                    <span>Balanced</span>
                    <span>Aggressive</span>
                  </div>
                </div>
              </div>

              {/* Kill Switch */}
              <div className="pt-4 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'var(--color-danger)', background: 'var(--color-danger-bg)' }}>
                  <div>
                    <h4 className="text-[13px] font-bold" style={{ color: '#991b1b' }}>Danger Zone</h4>
                    <p className="text-[11px]" style={{ color: '#991b1b', opacity: 0.8 }}>Liquidate agent and return funds.</p>
                  </div>
                  <button 
                    onClick={handleLiquidate}
                    disabled={isSimulating}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white uppercase tracking-wide flex items-center gap-1 hover:opacity-90 transition-opacity"
                    style={{ background: '#b91c1c' }}
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
              className="px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
              style={{ color: 'var(--color-text-secondary)' }}
            >
              Cancel
            </button>
            <button 
              onClick={handleSave}
              disabled={isSimulating}
              className="px-5 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all disabled:opacity-50"
              style={{ background: 'var(--color-brand)', color: 'white' }}
            >
              {isSimulating ? (
                <>
                  <div className="spinner h-3 w-3" />
                  Signing PTB...
                </>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Apply Policy
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
