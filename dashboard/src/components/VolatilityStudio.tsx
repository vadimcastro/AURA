import React, { useState, useEffect, useRef } from 'react';
import { Sliders, RefreshCw, Layers } from 'lucide-react';

export const VolatilityStudio: React.FC = () => {
  // SVI Volatility Surface state parameters
  const [a, setA] = useState(0.04);
  const [b, setB] = useState(0.10);
  const [rho, setRho] = useState(-0.40);
  const [m, setM] = useState(0.01);
  const [sigma, setSigma] = useState(0.15);

  const [lowerStrike, setLowerStrike] = useState(65000);
  const [higherStrike, setHigherStrike] = useState(75000);
  const [underlying, setUnderlying] = useState(70000);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rotation, setRotation] = useState({ alpha: 30, beta: 45 }); // Alpha: pitch, Beta: yaw
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });

  // Rotate surface automatically or on drag
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId = 0;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const width = canvas.width;
      const height = canvas.height;
      const cx = width / 2;
      const cy = height / 2 + 30;

      // Draw grid details
      const gridRows = 25; // Strike axis
      const gridCols = 15; // Expiry axis

      // 3D perspective projection helpers
      const radAlpha = (rotation.alpha * Math.PI) / 180;
      const radBeta = (rotation.beta * Math.PI) / 180;

      const cosA = Math.cos(radAlpha);
      const sinA = Math.sin(radAlpha);
      const cosB = Math.cos(radBeta);
      const sinB = Math.sin(radBeta);

      // Project point (x, y, z) in [-1, 1] range to screen coords
      const project = (x: number, y: number, z: number) => {
        // Rotate around Y (beta / yaw)
        const x1 = x * cosB - y * sinB;
        const y1 = x * sinB + y * cosB;

        // Rotate around X (alpha / pitch)
        const x2 = x1;
        const y2 = y1 * cosA - z * sinA;
        const z2 = y1 * sinA + z * cosA;

        // Perspective scale
        const scale = 220 / (z2 + 3.0);
        return {
          px: cx + x2 * scale * 1.5,
          py: cy - y2 * scale * 1.5,
        };
      };

      // Draw boundary grid axes
      ctx.strokeStyle = 'var(--color-border)';
      ctx.lineWidth = 1;

      // 1. Plot the wireframe surface
      // Strike variable (k = log-strike / standard-strike)
      // Expiry variable (t = time to maturity)
      const getSviVol = (k: number, t: number) => {
        // Raw SVI variance calculation
        const rawVar = a + b * (rho * (k - m) + Math.sqrt(Math.pow(k - m, 2) + Math.pow(sigma, 2)));
        // Adjust volatility term structure by time to maturity
        const vol = Math.sqrt(Math.max(0.0001, rawVar)) * (1.0 - 0.25 * Math.log(t + 0.5));
        return vol;
      };

      const points: { px: number; py: number; vol: number }[][] = [];

      for (let r = 0; r <= gridRows; r++) {
        points[r] = [];
        const x = (r / gridRows) * 2 - 1; // [-1, 1] representing log strike variance
        const k = x * 0.4; // log strike deviation

        for (let c = 0; c <= gridCols; c++) {
          const y = (c / gridCols) * 2 - 1; // [-1, 1] representing expiry time
          const t = (c / gridCols) * 0.9 + 0.1; // [0.1, 1.0] year maturity
          const vol = getSviVol(k, t);

          // Map volatility value (typically 0.1 to 0.7) to z axis [-0.5, 0.5]
          const z = (vol - 0.3) * 1.5; 

          points[r][c] = {
            ...project(x * 1.2, y * 1.2, z),
            vol,
          };
        }
      }

      // Draw grid columns (expiry lines)
      for (let c = 0; c <= gridCols; c++) {
        ctx.beginPath();
        for (let r = 0; r <= gridRows; r++) {
          const p = points[r][c];
          if (r === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        // Gradient color based on column position (time)
        ctx.strokeStyle = `rgba(79, 110, 247, ${0.15 + (c / gridCols) * 0.4})`;
        ctx.stroke();
      }

      // Draw grid rows (strike lines)
      for (let r = 0; r <= gridRows; r++) {
        ctx.beginPath();
        for (let c = 0; c <= gridCols; c++) {
          const p = points[r][c];
          if (c === 0) ctx.moveTo(p.px, p.py);
          else ctx.lineTo(p.px, p.py);
        }
        // Color transition based on strike height (volatility value)
        ctx.strokeStyle = `rgba(129, 140, 248, ${0.15 + (r / gridRows) * 0.4})`;
        ctx.stroke();
      }

      // 2. Render overlays: Current underlying price & active option strikes
      const kUnderlying = 0; // Center strike
      const kLower = Math.log(lowerStrike / underlying);
      const kHigher = Math.log(higherStrike / underlying);

      // Project the strike boundaries across all maturities
      const drawStrikeBoundary = (kVal: number, color: string, label: string) => {
        const xCoord = (kVal / 0.4); // inverse of deviation scaling
        if (Math.abs(xCoord) <= 1.2) {
          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          for (let c = 0; c <= gridCols; c++) {
            const t = (c / gridCols) * 0.9 + 0.1;
            const vol = getSviVol(kVal, t);
            const z = (vol - 0.3) * 1.5;
            const screenPt = project(xCoord * 1.2, (c / gridCols) * 2.4 - 1.2, z);
            if (c === 0) ctx.moveTo(screenPt.px, screenPt.py);
            else ctx.lineTo(screenPt.px, screenPt.py);
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.setLineDash([]);
          
          // Draw label at the front edge (c = gridCols)
          const lastT = 1.0;
          const lastVol = getSviVol(kVal, lastT);
          const lastZ = (lastVol - 0.3) * 1.5;
          const labelPt = project(xCoord * 1.2, 1.2, lastZ);
          ctx.fillStyle = color;
          ctx.font = 'bold 9px monospace';
          ctx.fillText(label, labelPt.px - 20, labelPt.py - 8);
        }
      };

      // Draw Underlying Price index
      drawStrikeBoundary(kUnderlying, '#818cf8', 'SPOT');
      // Draw Lower Strike bound
      drawStrikeBoundary(kLower, '#f43f5e', 'LOWER');
      // Draw Higher Strike bound
      drawStrikeBoundary(kHigher, '#10b981', 'UPPER');
    };

    render();

    // Mouse drag controls for rotating
    const handleMouseDown = (e: MouseEvent) => {
      isDragging.current = true;
      dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;

      setRotation((prev) => ({
        alpha: Math.min(80, Math.max(10, prev.alpha + dy * 0.5)),
        beta: (prev.beta - dx * 0.5) % 360,
      }));

      dragStart.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      isDragging.current = false;
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      if (animId) {
        cancelAnimationFrame(animId);
      }
    };
  }, [rotation, a, b, rho, m, sigma, lowerStrike, higherStrike, underlying]);

  const resetParams = () => {
    setA(0.04);
    setB(0.10);
    setRho(-0.40);
    setM(0.01);
    setSigma(0.15);
  };

  return (
    <div className="grid gap-8 lg:grid-cols-3">
      {/* Parameters Panel */}
      <div
        className="rounded-2xl p-6 space-y-6 lg:col-span-1"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex justify-between items-center pb-2 border-b" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              SVI Parameters
            </h3>
          </div>
          <button
            onClick={resetParams}
            className="p-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
            title="Reset default values"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>

        <p className="text-[12px] leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          Adjust the Stochastic Volatility Inspired (SVI) parameters dynamically to model volatility surfaces and inspect safe arbitrage boundaries.
        </p>

        {/* Sliders */}
        <div className="space-y-4 text-[12px]">
          <div>
            <div className="flex justify-between font-mono mb-1.5">
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>a (Min Variance)</span>
              <span className="font-semibold text-[var(--color-brand)]">{a.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.2"
              step="0.001"
              value={a}
              onChange={(e) => setA(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1.5">
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>b (Wing Slope)</span>
              <span className="font-semibold text-[var(--color-brand)]">{b.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.4"
              step="0.01"
              value={b}
              onChange={(e) => setB(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1.5">
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>rho (Skew/Asymmetry)</span>
              <span className="font-semibold text-[var(--color-brand)]">{rho.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="-0.95"
              max="0.95"
              step="0.01"
              value={rho}
              onChange={(e) => setRho(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1.5">
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>m (Vertex Location)</span>
              <span className="font-semibold text-[var(--color-brand)]">{m.toFixed(3)}</span>
            </div>
            <input
              type="range"
              min="-0.2"
              max="0.2"
              step="0.005"
              value={m}
              onChange={(e) => setM(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
            />
          </div>

          <div>
            <div className="flex justify-between font-mono mb-1.5">
              <span className="font-semibold" style={{ color: 'var(--color-text-secondary)' }}>sigma (Vertex Smoothness)</span>
              <span className="font-semibold text-[var(--color-brand)]">{sigma.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min="0.01"
              max="0.4"
              step="0.01"
              value={sigma}
              onChange={(e) => setSigma(parseFloat(e.target.value))}
              className="w-full h-1 bg-[var(--color-border)] rounded-lg appearance-none cursor-pointer accent-[var(--color-brand)]"
            />
          </div>
        </div>

        {/* Dynamic Strike Inputs */}
        <div className="pt-4 border-t space-y-4" style={{ borderColor: 'var(--color-border)' }}>
          <h4 className="text-[12px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
            Option Boundary Sandbox
          </h4>

          <div className="grid grid-cols-3 gap-3 text-[12px]">
            <div>
              <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Lower Bound</label>
              <input
                type="number"
                value={lowerStrike}
                onChange={(e) => setLowerStrike(parseInt(e.target.value) || 0)}
                className="w-full p-2 font-mono rounded-lg border text-center focus:outline-none"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Spot Reference</label>
              <input
                type="number"
                value={underlying}
                onChange={(e) => setUnderlying(parseInt(e.target.value) || 0)}
                className="w-full p-2 font-mono rounded-lg border text-center focus:outline-none"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
            <div>
              <label className="block text-[11px] mb-1 font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Upper Bound</label>
              <input
                type="number"
                value={higherStrike}
                onChange={(e) => setHigherStrike(parseInt(e.target.value) || 0)}
                className="w-full p-2 font-mono rounded-lg border text-center focus:outline-none"
                style={{ background: 'var(--color-bg)', borderColor: 'var(--color-border)', color: 'var(--color-text-primary)' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Surface Plot Rendering Canvas */}
      <div
        className="rounded-2xl p-6 lg:col-span-2 flex flex-col items-center justify-between"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
      >
        <div className="w-full flex justify-between items-center pb-2 border-b mb-4" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5" style={{ color: 'var(--color-brand)' }} />
            <h3 className="text-[15px] font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Interactive 3D Variance Projection
            </h3>
          </div>
          <span className="text-[11px] text-[var(--color-text-muted)] italic">
            Drag canvas to rotate view
          </span>
        </div>

        <div className="relative flex-grow flex items-center justify-center w-full">
          <canvas
            ref={canvasRef}
            width={580}
            height={360}
            className="cursor-grab active:cursor-grabbing border rounded-xl"
            style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)' }}
          />
        </div>

        <div className="w-full grid grid-cols-3 gap-4 pt-4 border-t mt-4 text-[12px]" style={{ borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1.5 inline-block bg-[#f43f5e] rounded-sm"></span>
            <span style={{ color: 'var(--color-text-secondary)' }}>Lower Bound strike</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1.5 inline-block bg-[#818cf8] rounded-sm"></span>
            <span style={{ color: 'var(--color-text-secondary)' }}>Spot reference vector</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-1.5 inline-block bg-[#10b981] rounded-sm"></span>
            <span style={{ color: 'var(--color-text-secondary)' }}>Upper Bound strike</span>
          </div>
        </div>
      </div>
    </div>
  );
};
