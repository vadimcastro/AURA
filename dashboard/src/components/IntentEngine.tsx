import React, { useState } from 'react';
import { Shield, Sparkles, Send, CheckCircle, AlertCircle, Cpu, Loader2, ArrowRight, Server, UserCheck, PlayCircle, Eye } from 'lucide-react';
import { useSuiClient, useSignAndExecuteTransaction } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';

interface IntentEngineProps {
  activeSession: any;
  suiBalance: string | null;
  dusdcBalance: string | null;
  onAddLiveEvent?: (event: any) => void;
  onSwitchTab?: (tab: 'landing' | 'agents' | 'intent' | 'volatility' | 'escalations' | 'operator') => void;
}

export const IntentEngine: React.FC<IntentEngineProps> = ({ 
  activeSession, 
  suiBalance, 
  dusdcBalance,
  onAddLiveEvent,
  onSwitchTab
}) => {
  const [prompt, setPrompt] = useState('');
  const [parsing, setParsing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [parsedIntent, setParsedIntent] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const suiClient = useSuiClient();
  const { mutateAsync: signAndExecuteTransaction } = useSignAndExecuteTransaction();

  const handleParse = async () => {
    if (!prompt.trim()) return;
    setParsing(true);
    setParsedIntent(null);
    setStatusMsg(null);

    let parsedResult = null;
    let usedModel = "Local Backup Parser";

    try {
      // Try calling the backend Intent Engine parser API
      const response = await fetch('/api/intent/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.success && data.parsed) {
        let { action, amount, lowerStrike, higherStrike, isConservative } = data.parsed;

        // Ensure strike formatting alignment: option strikes are scaled by 10,000 (e.g. 6.5 SUI -> 65000)
        if (lowerStrike && lowerStrike < 1000) {
          lowerStrike = Math.round(lowerStrike * 10000);
        }
        if (higherStrike && higherStrike < 1000) {
          higherStrike = Math.round(higherStrike * 10000);
        }

        parsedResult = {
          action: action || 'MINT_RANGE',
          amount: amount || 50,
          lowerStrike: lowerStrike || 65000,
          higherStrike: higherStrike || 75000,
          targetAgent: isConservative ? 'Conservative Yield Hunter' : 'Aggressive Vol Trader',
        };
        usedModel = data.modelUsed || 'AI Engine';
      } else {
        throw new Error(data.error || 'Invalid backend response format');
      }
    } catch (err) {
      console.warn("⚠️ Intent API offline/failed. Engaging Local Backup Parser:", (err as Error).message);
      
      // Fallback local regex parsing engine (Local Backup Parser)
      const promptLower = prompt.toLowerCase();
      let targetAgent = 'Aggressive Vol Trader';
      let lowerStrike = 62000;
      let higherStrike = 78000;
      
      if (promptLower.includes('conservative') || promptLower.includes('low risk')) {
        targetAgent = 'Conservative Yield Hunter';
        lowerStrike = 67000;
        higherStrike = 73000;
      } else if (promptLower.includes('balanced') || promptLower.includes('moderate') || promptLower.includes('medium risk')) {
        targetAgent = 'Balanced Risk Manager';
        lowerStrike = 65000;
        higherStrike = 75000;
      }

      let amount = 50; // default dUSDC
      const amountMatch = prompt.match(/\b(\d+)\s*(?:dusdc|usdc|dollars|dusd)\b/i);
      if (amountMatch) {
        amount = parseInt(amountMatch[1], 10);
      }

      parsedResult = {
        action: 'MINT_RANGE',
        amount,
        lowerStrike,
        higherStrike,
        targetAgent,
      };
      usedModel = 'Local Backup Parser';
    }

    if (parsedResult) {
      const amount = parsedResult.amount;
      const lowerStrike = parsedResult.lowerStrike;
      const higherStrike = parsedResult.higherStrike;
      const targetAgent = parsedResult.targetAgent;

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
        action: parsedResult.action,
        targetAgent,
        amount: amount * 1000000, // to raw dUSDC decimals
        lowerStrike,
        higherStrike,
        expiry: Math.floor(Date.now() / 1000) + 86400, // 24h
        gasBudget: 2000000, // 0.002 SUI
        modelUsed: usedModel,
        guardianCheck: {
          passed,
          reason
        }
      });
    }
    setParsing(false);
  };

  const handleExecute = async () => {
    if (!parsedIntent) return;
    setExecuting(true);
    setStatusMsg(null);

    const isWalletConnected = activeSession?.type === 'wallet';

    if (isWalletConnected) {
      try {
        console.log("📡 Signing & executing natural language intent PTB on-chain...");
        const tx = new Transaction();

        // 1. Query user's dUSDC coins to borrow for options minting
        const dUsdcType = import.meta.env.VITE_DUSDC_TYPE_TAG || '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
        const userAddress = activeSession.address;
        
        const coinsRes = await suiClient.getCoins({
          owner: userAddress,
          coinType: dUsdcType,
        });

        if (coinsRes.data.length === 0) {
          throw new Error("No dUSDC coins found in your wallet. Please top up or swap some SUI for dUSDC first.");
        }

        // Calculate amount to split
        const targetRawAmount = parsedIntent.amount; // already in decimals
        
        // Find or merge coins to get enough balance
        let totalBalance = 0;
        const inputCoins: string[] = [];
        for (const coin of coinsRes.data) {
          totalBalance += parseInt(coin.balance, 10);
          inputCoins.push(coin.coinObjectId);
          if (totalBalance >= targetRawAmount) break;
        }

        if (totalBalance < targetRawAmount) {
          throw new Error(`Insufficient dUSDC balance. You have ${(totalBalance / 1e6).toFixed(2)} dUSDC, but need ${(targetRawAmount / 1e6).toFixed(2)} dUSDC.`);
        }

        // Primary coin is the first coin in our selection
        const primaryCoinInput = tx.object(inputCoins[0]);

        // Merge remaining coins into primary if we need multiple input coins to satisfy amount
        if (inputCoins.length > 1) {
          tx.mergeCoins(
            primaryCoinInput,
            inputCoins.slice(1).map(c => tx.object(c))
          );
        }

        // Split the target trade amount from the primary coin
        const [tradeCoin] = tx.splitCoins(primaryCoinInput, [tx.pure.u64(targetRawAmount)]);

        // 2. Call the options pool mint_range on-chain
        const auraPackageId = import.meta.env.VITE_AURA_PACKAGE_ID || '0xb03d26d64408c965e293940b1d2c83b28758bf152600d662cdb29294ad87952e';
        const poolId = '0xbf86bd26e5343dd8a4d0e4b501b3185dfc5bdf174f57f38e60b19a84f75e8436';
        const oracleId = '0x0000000000000000000000000000000000000000000000000000000000000006';

        // Call predictive mint range
        const [remainingCoin] = tx.moveCall({
          target: `${auraPackageId}::predict_pool::mint_range`,
          typeArguments: [dUsdcType],
          arguments: [
            tx.object(poolId),
            tradeCoin,
            tx.pure.address(oracleId),
            tx.pure.u64(parsedIntent.expiry),
            tx.pure.u64(parsedIntent.lowerStrike),
            tx.pure.u64(parsedIntent.higherStrike),
          ]
        });

        // 3. Return remaining coin back to the sender
        tx.transferObjects([remainingCoin], userAddress);

        // 4. Sign and execute transaction
        const result = await signAndExecuteTransaction({
          transaction: tx,
        });

        console.log(`On-chain intent execution succeeded. Digest: ${result.digest}`);
        setStatusMsg(`On-chain PTB Executed Successfully! Digest: ${result.digest.substring(0, 14)}... (Options Range Minted on DeepBook Predict)`);

        if (onAddLiveEvent) {
          onAddLiveEvent({
            id: `intent-tx-${Date.now()}`,
            type: 'trade',
            agent: activeSession.address,
            message: `Intent executed: Mint range ${(parsedIntent.lowerStrike / 10000).toFixed(2)} - ${(parsedIntent.higherStrike / 10000).toFixed(2)} SUI with ${(parsedIntent.amount / 1000000).toFixed(0)} dUSDC`,
            timestamp: new Date().toISOString(),
            digest: result.digest,
            isMocked: false,
          });
        }

        setPrompt('');
        setParsedIntent(null);
      } catch (err) {
        console.error("On-chain intent execution failed:", err);
        alert(`On-chain execution failed: ${(err as Error).message}`);
      } finally {
        setExecuting(false);
      }
    } else {
      // Fallback for Guest/zkLogin simulated flows
      const txDigest = '0x' + Math.random().toString(16).substring(2, 10) + Math.random().toString(16).substring(2, 10);
      setTimeout(() => {
        setExecuting(false);
        setStatusMsg(`PTB Executed Successfully! Digest: ${txDigest.substring(0, 14)}... (Guest/zkLogin simulated execution)`);
        
        if (onAddLiveEvent) {
          onAddLiveEvent({
            id: `intent-tx-${Date.now()}`,
            type: 'trade',
            agent: activeSession?.address || '0xded1f38aa191a972cb56c33062629a74045c1d80341e9148aa96f2ba1443f676',
            message: `Intent executed: Mint range ${(parsedIntent.lowerStrike / 10000).toFixed(2)} - ${(parsedIntent.higherStrike / 10000).toFixed(2)} SUI with ${(parsedIntent.amount / 1000000).toFixed(0)} dUSDC`,
            timestamp: new Date().toISOString(),
            digest: txDigest,
            isMocked: true,
          });
        }

        setPrompt('');
        setParsedIntent(null);
      }, 1500);
    }
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Top Banner: Workflow Steps Lifecycle Guide */}
      <div 
        className="col-span-1 lg:col-span-2 rounded-xl p-4 border flex flex-col md:flex-row items-center justify-between gap-4"
        style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
      >
        <div className="space-y-1 text-center md:text-left">
          <h4 className="text-[13px] font-bold uppercase tracking-wider text-[var(--color-brand)]">
            AURA System Lifecycle Guide
          </h4>
          <p className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
            Follow the recommended progression to activate, register, prompt, and audit autonomous agents.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 text-[10px] font-medium">
          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-opacity-30" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <Server className="h-3.5 w-3.5" style={{ color: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--color-text-primary)' }}>1. Start Server</span>
          </div>
          
          <ArrowRight className="h-3 w-3 opacity-40 hidden md:block" style={{ color: 'var(--color-text-muted)' }} />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-opacity-30" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <UserCheck className="h-3.5 w-3.5" style={{ color: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--color-text-primary)' }}>2. Register Agent</span>
          </div>

          <ArrowRight className="h-3 w-3 opacity-40 hidden md:block" style={{ color: 'var(--color-text-muted)' }} />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-opacity-30" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <PlayCircle className="h-3.5 w-3.5" style={{ color: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--color-text-primary)' }}>3. Run Loop/Step</span>
          </div>

          <ArrowRight className="h-3 w-3 opacity-40 hidden md:block" style={{ color: 'var(--color-text-muted)' }} />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-indigo-500 bg-opacity-10" style={{ borderColor: 'rgba(99, 102, 241, 0.4)', background: 'var(--color-surface)' }}>
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-indigo-200 font-semibold">4. Prompt Intent</span>
          </div>

          <ArrowRight className="h-3 w-3 opacity-40 hidden md:block" style={{ color: 'var(--color-text-muted)' }} />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-opacity-30" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <Eye className="h-3.5 w-3.5" style={{ color: 'var(--color-brand)' }} />
            <span style={{ color: 'var(--color-text-primary)' }}>5. Audit / Decrypt</span>
          </div>

          <ArrowRight className="h-3 w-3 opacity-40 hidden md:block" style={{ color: 'var(--color-text-muted)' }} />

          <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-opacity-30" style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}>
            <AlertCircle className="h-3.5 w-3.5 text-red-400" />
            <span style={{ color: 'var(--color-text-primary)' }}>6. Dispute / Slash</span>
          </div>
        </div>
      </div>

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
            placeholder="e.g., Deploy 10 dUSDC into a conservative DeepBook options range strategy"
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
          <div className="space-y-3">
            <div
              className="rounded-xl p-4 text-[12px] flex gap-2"
              style={{ background: 'var(--color-success-bg)', border: '1px solid rgba(5, 150, 105, 0.2)', color: 'var(--color-success)' }}
            >
              <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <p className="font-medium leading-normal">{statusMsg}</p>
            </div>
            
            {onSwitchTab && (
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  onClick={() => onSwitchTab('agents')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all hover:bg-opacity-25"
                  style={{ 
                    borderColor: 'var(--color-brand)', 
                    color: 'var(--color-brand)',
                    background: 'rgba(99, 102, 241, 0.05)'
                  }}
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Agent Directory & Audit Studio
                </button>
                <button
                  onClick={() => onSwitchTab('operator')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold border cursor-pointer transition-all hover:bg-opacity-25"
                  style={{ 
                    borderColor: 'var(--color-border)', 
                    color: 'var(--color-text-secondary)',
                    background: 'var(--color-surface-2)'
                  }}
                >
                  <Server className="h-3.5 w-3.5" />
                  Operator Console
                </button>
              </div>
            )}
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
                border: `1px solid ${parsedIntent.guardianCheck.passed ? 'rgba(5, 150, 105, 0.2)' : 'rgba(220, 38, 38, 0.2)'}`,
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
              <div className="flex justify-between items-center">
                <h4 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                  Proposed SUI PTB Parameters
                </h4>
                <span className="text-[10px] px-2 py-0.5 rounded border font-semibold" style={{ background: 'var(--color-surface-2)', borderColor: 'var(--color-border)', color: 'var(--color-text-secondary)' }}>
                  Engine: {parsedIntent.modelUsed}
                </span>
              </div>
              
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
                  <span className="font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>{(parsedIntent.lowerStrike / 10000).toFixed(2)} - {(parsedIntent.higherStrike / 10000).toFixed(2)} SUI</span>
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
