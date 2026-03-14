import { useRef, useEffect, useCallback, useState } from "react";
import {
  SlidersHorizontal,
  Spline,
  Palette,
  Droplets,
  Sun,
  RotateCcw,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  useEditor,
  type LayerAdjustments,
  type CurvePoint,
  DEFAULT_LEVELS,
  DEFAULT_CURVES,
  DEFAULT_COLOR_BALANCE,
  DEFAULT_HUE_SATURATION,
  DEFAULT_BLUR_SHARPEN,
} from "./editor-store";
import { hasActiveAdjustments } from "./adjustment-utils";

type AdjustmentTab =
  | "levels"
  | "curves"
  | "colorBalance"
  | "hueSaturation"
  | "blurSharpen";

// ─── Reusable slider row ──────────────────────────────────────────────
function AdjSlider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  onCommit,
  unit = "",
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onCommit?: () => void;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-[10px] text-muted-foreground w-16 shrink-0 truncate">
        {label}
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={() => onCommit?.()}
        className="flex-1 accent-primary h-1"
      />
      <span className="text-[10px] w-10 text-right tabular-nums">
        {step < 1 ? value.toFixed(1) : value}
        {unit}
      </span>
    </div>
  );
}

// ─── Section wrapper with collapsible header ──────────────────────────
function Section({
  title,
  icon: Icon,
  isActive,
  open,
  onToggle,
  onReset,
  children,
}: {
  title: string;
  icon: React.ElementType;
  isActive: boolean;
  open: boolean;
  onToggle: () => void;
  onReset: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/50">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/30 transition-colors"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="flex-1 text-left">{title}</span>
        {isActive && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
        )}
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          className="text-muted-foreground hover:text-foreground p-0.5 rounded hover:bg-accent"
          title={`Reset ${title}`}
        >
          <RotateCcw className="w-3 h-3" />
        </span>
      </button>
      {open && <div className="px-3 pb-2.5 space-y-1.5">{children}</div>}
    </div>
  );
}

// ─── Mini curves canvas editor ────────────────────────────────────────
function CurvesEditor({
  points,
  channel,
  onChange,
  onCommit,
}: {
  points: CurvePoint[];
  channel: "rgb" | "red" | "green" | "blue";
  onChange: (pts: CurvePoint[]) => void;
  onCommit?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const size = 180;

  const colors: Record<string, string> = {
    rgb: "#e0e0e0",
    red: "#ff6b6b",
    green: "#69db7c",
    blue: "#74c0fc",
  };

  const getCanvasPos = (e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.round(((e.clientX - rect.left) / rect.width) * 255),
      y: Math.round((1 - (e.clientY - rect.top) / rect.height) * 255),
    };
  };

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const dark = document.documentElement.classList.contains("dark");

    ctx.fillStyle = dark ? "#1a1a1a" : "#f5f5f5";
    ctx.fillRect(0, 0, size, size);

    ctx.strokeStyle = dark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const p = (i / 4) * size;
      ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
    }

    ctx.strokeStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(0, size); ctx.lineTo(size, 0); ctx.stroke();
    ctx.setLineDash([]);

    const sorted = [...points].sort((a, b) => a.x - b.x);
    ctx.strokeStyle = colors[channel];
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let px = 0; px <= 255; px++) {
      let lo = 0, hi = sorted.length - 1;
      for (let j = 0; j < sorted.length - 1; j++) {
        if (px >= sorted[j].x && px <= sorted[j + 1].x) { lo = j; hi = j + 1; break; }
      }
      let y: number;
      if (px <= sorted[0].x) y = sorted[0].y;
      else if (px >= sorted[sorted.length - 1].x) y = sorted[sorted.length - 1].y;
      else {
        const range = sorted[hi].x - sorted[lo].x;
        const t = range > 0 ? (px - sorted[lo].x) / range : 0;
        const st = t * t * (3 - 2 * t);
        y = sorted[lo].y + st * (sorted[hi].y - sorted[lo].y);
      }
      const sx = (px / 255) * size;
      const sy = (1 - y / 255) * size;
      if (px === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
    }
    ctx.stroke();

    for (let i = 0; i < sorted.length; i++) {
      const sx = (sorted[i].x / 255) * size;
      const sy = (1 - sorted[i].y / 255) * size;
      ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2);
      ctx.fillStyle = colors[channel]; ctx.fill();
      ctx.strokeStyle = dark ? "#333" : "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }, [points, channel]);

  useEffect(() => { draw(); }, [draw]);

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const sorted = [...points].sort((a, b) => a.x - b.x);
    for (let i = 0; i < sorted.length; i++) {
      if (Math.abs(pos.x - sorted[i].x) < 12 && Math.abs(pos.y - sorted[i].y) < 12) {
        setDragging(i); return;
      }
    }
    const np = { x: Math.max(0, Math.min(255, pos.x)), y: Math.max(0, Math.min(255, pos.y)) };
    const newPts = [...sorted, np].sort((a, b) => a.x - b.x);
    onChange(newPts);
    const idx = newPts.findIndex((p) => p.x === np.x && p.y === np.y);
    if (idx >= 0) setDragging(idx);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null) return;
    const pos = getCanvasPos(e);
    const sorted = [...points].sort((a, b) => a.x - b.x);
    onChange(sorted.map((p, i) =>
      i === dragging ? {
        x: i === 0 ? 0 : i === sorted.length - 1 ? 255 : Math.max(1, Math.min(254, pos.x)),
        y: Math.max(0, Math.min(255, pos.y)),
      } : p
    ));
  };

  const handleMouseUp = () => {
    if (dragging !== null) {
      setDragging(null);
      onCommit?.();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    const sorted = [...points].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length - 1; i++) {
      if (Math.abs(pos.x - sorted[i].x) < 12 && Math.abs(pos.y - sorted[i].y) < 12) {
        onChange(sorted.filter((_, j) => j !== i)); return;
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, cursor: "crosshair" }}
      className="rounded border border-border mx-auto block"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onDoubleClick={handleDoubleClick}
    />
  );
}

// ─── Color Balance sub-section ────────────────────────────────────────
function ColorBalanceSection({
  label,
  prefix,
  values,
  onChange,
  onCommit,
}: {
  label: string;
  prefix: "shadows" | "midtones" | "highlights";
  values: Record<string, number>;
  onChange: (updates: Record<string, number>) => void;
  onCommit?: () => void;
}) {
  const cr = values[`${prefix}CyanRed`] || 0;
  const mg = values[`${prefix}MagentaGreen`] || 0;
  const yb = values[`${prefix}YellowBlue`] || 0;

  return (
    <div className="space-y-1">
      <div className="text-[9px] text-muted-foreground">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-cyan-400 w-4">C</span>
        <input type="range" min={-100} max={100} value={cr}
          onChange={(e) => onChange({ [`${prefix}CyanRed`]: Number(e.target.value) })}
          onPointerUp={() => onCommit?.()}
          className="flex-1 accent-red-400 h-1" />
        <span className="text-[9px] text-red-400 w-4 text-right">R</span>
        <span className="text-[10px] w-8 text-right tabular-nums">{cr}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-fuchsia-400 w-4">M</span>
        <input type="range" min={-100} max={100} value={mg}
          onChange={(e) => onChange({ [`${prefix}MagentaGreen`]: Number(e.target.value) })}
          onPointerUp={() => onCommit?.()}
          className="flex-1 accent-green-400 h-1" />
        <span className="text-[9px] text-green-400 w-4 text-right">G</span>
        <span className="text-[10px] w-8 text-right tabular-nums">{mg}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-yellow-400 w-4">Y</span>
        <input type="range" min={-100} max={100} value={yb}
          onChange={(e) => onChange({ [`${prefix}YellowBlue`]: Number(e.target.value) })}
          onPointerUp={() => onCommit?.()}
          className="flex-1 accent-blue-400 h-1" />
        <span className="text-[9px] text-blue-400 w-4 text-right">B</span>
        <span className="text-[10px] w-8 text-right tabular-nums">{yb}</span>
      </div>
    </div>
  );
}

// ─── Main Adjustments Panel ───────────────────────────────────────────
export function AdjustmentsPanel() {
  const { layers, activeLayerId, updateLayer, updateLayerSilent, pushHistory } = useEditor();
  const [openSections, setOpenSections] = useState<Record<AdjustmentTab, boolean>>({
    levels: true,
    curves: false,
    colorBalance: false,
    hueSaturation: false,
    blurSharpen: false,
  });
  const [curveChannel, setCurveChannel] = useState<"rgb" | "red" | "green" | "blue">("rgb");

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const adj = activeLayer?.adjustments || {};

  // setAdj pushes history — use for discrete actions (reset, etc.)
  const setAdj = useCallback(
    (key: keyof LayerAdjustments, value: any) => {
      if (!activeLayerId) return;
      updateLayer(activeLayerId, {
        adjustments: { ...adj, [key]: value },
      });
    },
    [activeLayerId, adj, updateLayer]
  );

  // setAdjSilent does NOT push history — use for continuous slider/drag changes
  const setAdjSilent = useCallback(
    (key: keyof LayerAdjustments, value: any) => {
      if (!activeLayerId) return;
      updateLayerSilent(activeLayerId, {
        adjustments: { ...adj, [key]: value },
      });
    },
    [activeLayerId, adj, updateLayerSilent]
  );

  // commitAdj pushes a single history entry — call on pointerUp / mouseUp
  const commitAdj = useCallback(() => {
    pushHistory();
  }, [pushHistory]);

  const toggle = (tab: AdjustmentTab) =>
    setOpenSections((prev) => ({ ...prev, [tab]: !prev[tab] }));

  if (!activeLayer) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs gap-2 px-4 text-center">
        <SlidersHorizontal className="w-8 h-8 opacity-30" />
        <p>Select a layer to adjust</p>
      </div>
    );
  }

  const levels = adj.levels || { ...DEFAULT_LEVELS };
  const curves = adj.curves || { ...DEFAULT_CURVES };
  const colorBal = adj.colorBalance || { ...DEFAULT_COLOR_BALANCE };
  const hueSat = adj.hueSaturation || { ...DEFAULT_HUE_SATURATION };
  const blurSharp = adj.blurSharpen || { ...DEFAULT_BLUR_SHARPEN };

  const isLevelsActive =
    levels.inputBlack !== 0 || levels.inputWhite !== 255 || levels.gamma !== 1 ||
    levels.outputBlack !== 0 || levels.outputWhite !== 255;

  const isCurvesActive = (() => {
    for (const ch of ["rgb", "red", "green", "blue"] as const) {
      const pts = curves[ch];
      if (pts.length !== 2) return true;
      if (pts[0].x !== 0 || pts[0].y !== 0 || pts[1].x !== 255 || pts[1].y !== 255) return true;
    }
    return false;
  })();

  const isColorBalActive = Object.values(colorBal).some((v) => v !== 0);
  const isHueSatActive = hueSat.hue !== 0 || hueSat.saturation !== 0 || hueSat.lightness !== 0;
  const isBlurSharpActive = blurSharp.blurRadius > 0 || blurSharp.sharpenAmount > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wider">Adjustments</span>
        </div>
        {hasActiveAdjustments(adj) && (
          <button
            onClick={() => {
              if (activeLayerId) updateLayer(activeLayerId, { adjustments: undefined });
            }}
            className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
            title="Reset all adjustments"
          >
            Reset All
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 border-b border-border/50 text-[10px] text-muted-foreground">
          Layer: <span className="text-foreground">{activeLayer.name}</span>
        </div>

        {/* ─── LEVELS ─── */}
        <Section title="Levels" icon={SlidersHorizontal} isActive={isLevelsActive}
          open={openSections.levels} onToggle={() => toggle("levels")}
          onReset={() => setAdj("levels", undefined)}>
          <div className="text-[9px] text-muted-foreground mb-1">Input</div>
          <AdjSlider label="Black" value={levels.inputBlack} min={0} max={254}
            onChange={(v) => setAdjSilent("levels", { ...levels, inputBlack: v })} onCommit={commitAdj} />
          <AdjSlider label="White" value={levels.inputWhite} min={1} max={255}
            onChange={(v) => setAdjSilent("levels", { ...levels, inputWhite: v })} onCommit={commitAdj} />
          <AdjSlider label="Gamma" value={levels.gamma} min={0.1} max={5} step={0.05}
            onChange={(v) => setAdjSilent("levels", { ...levels, gamma: v })} onCommit={commitAdj} />
          <div className="text-[9px] text-muted-foreground mt-1 mb-1">Output</div>
          <AdjSlider label="Black" value={levels.outputBlack} min={0} max={254}
            onChange={(v) => setAdjSilent("levels", { ...levels, outputBlack: v })} onCommit={commitAdj} />
          <AdjSlider label="White" value={levels.outputWhite} min={1} max={255}
            onChange={(v) => setAdjSilent("levels", { ...levels, outputWhite: v })} onCommit={commitAdj} />
        </Section>

        {/* ─── CURVES ─── */}
        <Section title="Curves" icon={Spline} isActive={isCurvesActive}
          open={openSections.curves} onToggle={() => toggle("curves")}
          onReset={() => setAdj("curves", undefined)}>
          <div className="flex gap-1 mb-2">
            {(["rgb", "red", "green", "blue"] as const).map((ch) => (
              <button key={ch} onClick={() => setCurveChannel(ch)}
                className={`flex-1 text-[10px] py-1 rounded transition-colors ${
                  curveChannel === ch
                    ? ch === "rgb" ? "bg-accent text-foreground"
                      : ch === "red" ? "bg-red-500/20 text-red-400"
                      : ch === "green" ? "bg-green-500/20 text-green-400"
                      : "bg-blue-500/20 text-blue-400"
                    : "text-muted-foreground hover:bg-accent/50"
                }`}>
                {ch.toUpperCase()}
              </button>
            ))}
          </div>
          <CurvesEditor points={curves[curveChannel]} channel={curveChannel}
            onChange={(pts) => setAdjSilent("curves", { ...curves, [curveChannel]: pts })}
            onCommit={commitAdj} />
          <div className="text-[9px] text-muted-foreground text-center mt-1">
            Click to add points · Double-click to remove
          </div>
        </Section>

        {/* ─── COLOR BALANCE ─── */}
        <Section title="Color Balance" icon={Palette} isActive={isColorBalActive}
          open={openSections.colorBalance} onToggle={() => toggle("colorBalance")}
          onReset={() => setAdj("colorBalance", undefined)}>
          <ColorBalanceSection label="Shadows" prefix="shadows" values={colorBal}
            onChange={(u) => setAdjSilent("colorBalance", { ...colorBal, ...u })}
            onCommit={commitAdj} />
          <ColorBalanceSection label="Midtones" prefix="midtones" values={colorBal}
            onChange={(u) => setAdjSilent("colorBalance", { ...colorBal, ...u })}
            onCommit={commitAdj} />
          <ColorBalanceSection label="Highlights" prefix="highlights" values={colorBal}
            onChange={(u) => setAdjSilent("colorBalance", { ...colorBal, ...u })}
            onCommit={commitAdj} />
        </Section>

        {/* ─── HUE / SATURATION ─── */}
        <Section title="Hue / Saturation" icon={Droplets} isActive={isHueSatActive}
          open={openSections.hueSaturation} onToggle={() => toggle("hueSaturation")}
          onReset={() => setAdj("hueSaturation", undefined)}>
          <AdjSlider label="Hue" value={hueSat.hue} min={-180} max={180}
            onChange={(v) => setAdjSilent("hueSaturation", { ...hueSat, hue: v })} onCommit={commitAdj} unit="°" />
          <AdjSlider label="Saturation" value={hueSat.saturation} min={-100} max={100}
            onChange={(v) => setAdjSilent("hueSaturation", { ...hueSat, saturation: v })} onCommit={commitAdj} />
          <AdjSlider label="Lightness" value={hueSat.lightness} min={-100} max={100}
            onChange={(v) => setAdjSilent("hueSaturation", { ...hueSat, lightness: v })} onCommit={commitAdj} />
        </Section>

        {/* ─── BLUR / SHARPEN ─── */}
        <Section title="Blur / Sharpen" icon={Sun} isActive={isBlurSharpActive}
          open={openSections.blurSharpen} onToggle={() => toggle("blurSharpen")}
          onReset={() => setAdj("blurSharpen", undefined)}>
          <div className="text-[9px] text-muted-foreground mb-0.5">Blur</div>
          <AdjSlider label="Radius" value={blurSharp.blurRadius} min={0} max={30} step={0.5}
            onChange={(v) => setAdjSilent("blurSharpen", { ...blurSharp, blurRadius: v })} onCommit={commitAdj} unit="px" />
          <div className="text-[9px] text-muted-foreground mt-1 mb-0.5">Sharpen</div>
          <AdjSlider label="Amount" value={blurSharp.sharpenAmount} min={0} max={200}
            onChange={(v) => setAdjSilent("blurSharpen", { ...blurSharp, sharpenAmount: v })} onCommit={commitAdj} unit="%" />
          <AdjSlider label="Radius" value={blurSharp.sharpenRadius} min={0.5} max={5} step={0.1}
            onChange={(v) => setAdjSilent("blurSharpen", { ...blurSharp, sharpenRadius: v })} onCommit={commitAdj} unit="px" />
        </Section>
      </div>
    </div>
  );
}