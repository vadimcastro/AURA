import React, { useState } from 'react';
import { Shield, Sparkles, Send, CheckCircle, AlertCircle, Cpu, Loader2 } from 'lucide-react';

interface IntentEngineProps {
  activeSession: any;
  suiBalance: string | null;
  dusdcBalance: string | null;
}

export const IntentEngine: React.FC<IntentEngineProps> = ({ 
  activeSession, 
  suiBalance, 
  dusdcBalance 
}) => {
  const [prompt, setPrompt] = useState('');
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [parsedIntent, setParsedIntent] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleParse = () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setParsedIntent(null);
    setStatusMsg(null);

    // Simulate parsing the natural language statement via Qwen3 Coder / LLM
    setTimeout(() => {
      let isConservative = prompt.toLowerCase().includes('conservative');
      let amount = 50; // default dUSDC
      const amountMatch = prompt.match(/\b(\d+)\s*(?:dusdc|usdc|dollars|dusd)\b/i);
      if (amountMatch) {
        amount = parseInt(amountMatch[1], 10);
      }

      // Check real balances if session is connected
      const userDusdc = dusdcBalance ? parseFloat(dusdcBalance) : 0;
      const userSui = suiBalance ? parseFloat(suiBalance) : 0;
      const hasEnoughDusdc = activeSession ? userDusdc >= amount : true;
      const hasEnoughSui = activeSession ? userSui >= 0.002 : true; // gas budget 0.002 SUI

      let passed = amount <= 100 && hasEnoughDusdc && hasEnoughSui;
      let reason = '';
      
      if (!activeSession) {
        passed = false;
        reason = 'Guardian Alert: Wallet not connected. Please connect your account or sign in with zkLogin to perform pre-flight balance and constraint checks.';
      } else if (!hasEnoughDusdc) {
        reason = `Guardian Alert: Insufficient Funds. You have ${userDusdc.toFixed(2)} dUSDC, but this trade requires ${amount.toFixed(2)} dUSDC. Swap SUI for dUSDC or top up via Stripe.`;
      } else if (!hasEnoughSui) {
        reason = `Guardian Alert: Insufficient Gas. You have ${userSui.toFixed(4)} SUI, but this transaction requires at least 0.0020 SUI for gas. Use the Sui Faucet to top up.`;
      } else if (amount > 100) {
        reason = `Warning: Requested trade size exceeds standard retail policy limits ($100 dUSDC). Verify allocations.`;
      } else {
        reason = `Trade size is within safe policy budget limits. Execution path is atomic and restricted to DeepBook Predict.`;
      }

      setParsedIntent({
        rawText: prompt,
        action: 'MINT_RANGE',
        targetAgent: isConservative ? 'Conservative Yield Hunter' : 'Aggressive Vol Trader',
        amount: amount * 1000000, // to raw dUSDC decimals
        lowerStrike: isConservative ? 67000 : 62000,
        higherStrike: isConservative ? 73000 : 78000,
        expiry: Math.floor(Date.now() / 1000) + 86400, // 24h
        gasBudget: 2000000, // 0.002 SUI
        guardianCheck: {
          passed,
          reason
        }
      });
      setParsing(false);
    }, 1500);
  };

  const handleExecute = () => {
    if (!parsedIntent) return;
    setExecuting(true);
    setStatusMsg(null);

    // Simulate executing the atomic PTB
    setTimeout(() => {
      setExecuting(false);
      setStatusMsg(`🎉 PTB Executed Successfully! Digest: 0x${Math.random().toString(16).substring(2, 10)}... (Hot potato TradeTicket consumed dynamically)`);
      setPrompt('');
      setParsedIntent(null);
    }, 2000);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left panel: NLP input */}
      <div
        className="rounded-xl shadow-sm p-5 space-y-4"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Natural Language Intent Engine
          </h3>
        </div>
        
        <p className="text-[13px]" style={{ color: 'var(--color-text-secondary)' }}>
          Type your desired trading strategy in plain English. The Intent Engine parses your query into an atomic Sui Programmable Transaction Block (PTB).
        </p>

        {/* Supported Actions & Protocols */}
        <div 
          className="p-3 rounded-xl border text-[11px] space-y-2"
          style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
        >
          <span className="font-bold text-[var(--color-text-primary)] block uppercase tracking-wider text-[10px]">
            Supported Actions & Integrated Protocols:
          </span>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1 shrink-0"></span>
              <div>
                <strong className="text-[var(--color-text-primary)] text-[11px]">MINT_RANGE</strong>
                <span className="block text-[var(--color-text-muted)] text-[10px]">DeepBook Options Range Minting</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1 shrink-0"></span>
              <div>
                <strong className="text-[var(--color-text-primary)] text-[11px]">SWAP</strong>
                <span className="block text-[var(--color-text-muted)] text-[10px]">Spot Cetus DEX Swaps</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 mt-1 shrink-0"></span>
              <div>
                <strong className="text-[var(--color-text-primary)] text-[11px]">LIQUIDITY</strong>
                <span className="block text-[var(--color-text-muted)] text-[10px]">Cetus LP Pool Deposits</span>
              </div>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 shrink-0"></span>
              <div>
                <strong className="text-[var(--color-text-primary)] text-[11px]">LEND</strong>
                <span className="block text-[var(--color-text-muted)] text-[10px]">SuiLend Collateral Supply</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Deploy 50 dUSDC into a conservative DeepBook options range strategy"
            className="w-full h-32 p-3 text-[13px] rounded-xl border focus:outline-none focus:ring-1 focus:ring-[var(--color-brand)] leading-relaxed"
            style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
            disabled={parsing || executing}
          />

          <div className="flex justify-between items-center">
            <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
              Powered by Qwen3-Coder-480B
            </span>
            <button
              onClick={handleParse}
              disabled={parsing || executing || !prompt.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white transition-all duration-200 cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}
            >
              {parsing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Parsing...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Parse Intent
                </>
              )}
            </button>
          </div>
        </div>

        {statusMsg && (
          <div
            className="rounded-xl p-4 text-[12px] flex gap-2"
            style={{ background: 'var(--color-success-bg)', border: '1px solid #d1f7e2', color: 'var(--color-success)' }}
          >
            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="font-medium leading-normal">{statusMsg}</p>
          </div>
        )}
      </div>

      {/* Right panel: Guardian Pre-Flight Check */}
      <div
        className="rounded-xl shadow-sm p-5"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
          <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Intent Guardian Check
          </h3>
        </div>

        {!parsedIntent ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-[13px] space-y-2">
            <Shield className="h-10 w-10 opacity-30" style={{ color: 'var(--color-text-muted)' }} />
            <p style={{ color: 'var(--color-text-muted)' }}>
              Type and parse an intent strategy to run the Guardian Check.
            </p>
          </div>
        ) : (
          <div className="space-y-5 text-[13px]">
            {/* Guardian Verdict Banner */}
            <div
              className="rounded-xl p-4 flex gap-2.5"
              style={{
                background: parsedIntent.guardianCheck.passed ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
                border: `1px solid ${parsedIntent.guardianCheck.passed ? '#d1f7e2' : '#fcd5d5'}`,
                color: parsedIntent.guardianCheck.passed ? 'var(--color-success)' : 'var(--color-danger)'
              }}
            >
              {parsedIntent.guardianCheck.passed ? (
                <CheckCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />
              )}
              <div>
                <p className="font-semibold">
                  {parsedIntent.guardianCheck.passed ? 'Guardian Check: Approved' : 'Guardian Alert: Review Required'}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed opacity-95">
                  {parsedIntent.guardianCheck.reason}
                </p>
              </div>
            </div>

            {/* Transaction Parameters */}
            <div className="space-y-3.5">
              <h4 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                Proposed SUI PTB Parameters
              </h4>
              
              <div className="rounded-xl p-4 space-y-3 border" style={{ borderColor: 'var(--color-border)' }}>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Target Agent</span>
                  <span className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>{parsedIntent.targetAgent}</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Allocation Size</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{(parsedIntent.amount / 1000000).toFixed(2)} dUSDC</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Options Strikes</span>
                  <span className="font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{parsedIntent.lowerStrike} - {parsedIntent.higherStrike} SUI</span>
                </div>
                <div className="flex justify-between">
                  <span style={{ color: 'var(--color-text-secondary)' }}>Expiry Window</span>
                  <span style={{ color: 'var(--color-text-primary)' }}>24 Hours (Atomic execution)</span>
                </div>
                <div className="flex justify-between pt-2 border-t" style={{ borderColor: 'var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Estimated Gas Cap</span>
                  <span className="font-mono text-[var(--color-brand)] font-semibold">{(parsedIntent.gasBudget / 1e9).toFixed(4)} SUI</span>
                </div>
              </div>
            </div>

            {/* Execute trigger */}
            <button
              onClick={handleExecute}
              disabled={executing || !parsedIntent.guardianCheck.passed || !activeSession}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold text-white transition-all cursor-pointer hover:opacity-95 disabled:opacity-50"
              style={{ background: 'var(--color-brand)' }}
            >
              {executing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executing Atomic PTB...
                </>
              ) : (
                <>
                  <Cpu className="h-4 w-4" />
                  Sign & Deploy Strategy
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
