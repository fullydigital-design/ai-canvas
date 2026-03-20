import {
  MousePointer2,
  Move,
  Square,
  Paintbrush,
  Eraser,
  Hand,
  ZoomIn,
  CircleDot,
  Minus,
  Plus,
  Scaling,
  Type,
  Lasso,
  Wand,
  Stamp,
  Droplets,
  Sparkles,
  Pipette,
  Blend,
  Crop,
  Circle,
} from "lucide-react";
import { useEditorSelector, type Tool, type GradientMode, type CropAspectRatio } from "./editor-store";
import { useState, Suspense, lazy, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { FiltersGallery } from "./filters-gallery";
import { useShallow } from "zustand/react/shallow";

const TextToolPanel = lazy(() =>
  import("./text-tool-panel").then((m) => ({ default: m.TextToolPanel }))
);

const mainTools: { id: Tool; icon: React.ElementType; label: string; separator?: boolean }[] = [
  { id: "select", icon: MousePointer2, label: "Select (V)" },
  { id: "move", icon: Move, label: "Move (M)" },
  { id: "transform", icon: Scaling, label: "Transform (T)" },
  { id: "crop", icon: Crop, label: "Crop (C)" },
  { id: "rectangle-select", icon: Square, label: "Rectangle Select (R)", separator: true },
  { id: "lasso", icon: Lasso, label: "Lasso Select (L)" },
  { id: "magic-wand", icon: Wand, label: "Magic Wand (W)", separator: true },
  { id: "brush", icon: Paintbrush, label: "Brush (B)" },
  { id: "eraser", icon: Eraser, label: "Eraser (E)" },
  { id: "clone-stamp", icon: Stamp, label: "Clone Stamp (S)" },
  { id: "healing-brush", icon: Droplets, label: "Healing Brush (J)" },
  { id: "eyedropper", icon: Pipette, label: "Eyedropper (I)" },
  { id: "gradient", icon: Blend, label: "Gradient (G)", separator: true },
  { id: "text", icon: Type, label: "Text (Y)" },
  { id: "hand", icon: Hand, label: "Pan (H)" },
  { id: "zoom", icon: ZoomIn, label: "Zoom (Z)" },
];

const maskTools: { id: Tool; icon: React.ElementType; label: string }[] = [
  { id: "mask-brush", icon: Paintbrush, label: "Mask Brush - Reveal (white)" },
  { id: "mask-eraser", icon: Eraser, label: "Mask Eraser - Hide (black)" },
];

type Rgb = { r: number; g: number; b: number };
type Hsv = { h: number; s: number; v: number };
type ColorPickerTarget = "eyedropper" | "gradient-start" | "gradient-end";

function clampInt(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function clampFloat(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex: string): Rgb {
  const cleaned = hex.replace("#", "");
  const normalized =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  const safe = /^[0-9a-fA-F]{6}$/.test(normalized) ? normalized : "000000";
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb) {
  const rr = clampInt(r, 0, 255).toString(16).padStart(2, "0");
  const gg = clampInt(g, 0, 255).toString(16).padStart(2, "0");
  const bb = clampInt(b, 0, 255).toString(16).padStart(2, "0");
  return `#${rr}${gg}${bb}`;
}

function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  const v = max;
  return {
    h: clampInt(h, 0, 360),
    s: clampInt(s * 100, 0, 100),
    v: clampInt(v * 100, 0, 100),
  };
}

function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hh = ((h % 360) + 360) % 360;
  const ss = clampInt(s, 0, 100) / 100;
  const vv = clampInt(v, 0, 100) / 100;
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let rn = 0;
  let gn = 0;
  let bn = 0;
  if (hh < 60) {
    rn = c;
    gn = x;
  } else if (hh < 120) {
    rn = x;
    gn = c;
  } else if (hh < 180) {
    gn = c;
    bn = x;
  } else if (hh < 240) {
    gn = x;
    bn = c;
  } else if (hh < 300) {
    rn = x;
    bn = c;
  } else {
    rn = c;
    bn = x;
  }

  return {
    r: clampInt((rn + m) * 255, 0, 255),
    g: clampInt((gn + m) * 255, 0, 255),
    b: clampInt((bn + m) * 255, 0, 255),
  };
}

export function Toolbar() {
  const {
    activeTool,
    setActiveTool,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    editingMaskLayerId,
    magicWandTolerance,
    setMagicWandTolerance,
    magicWandContiguous,
    setMagicWandContiguous,
    gradientEndColor,
    setGradientEndColor,
    gradientMode,
    setGradientMode,
    cropAspectRatio,
    setCropAspectRatio,
  } = useEditorSelector(
    useShallow((s) => ({
      activeTool: s.activeTool,
      setActiveTool: s.setActiveTool,
      brushSize: s.brushSize,
      setBrushSize: s.setBrushSize,
      brushColor: s.brushColor,
      setBrushColor: s.setBrushColor,
      brushHardness: s.brushHardness,
      setBrushHardness: s.setBrushHardness,
      editingMaskLayerId: s.editingMaskLayerId,
      magicWandTolerance: s.magicWandTolerance,
      setMagicWandTolerance: s.setMagicWandTolerance,
      magicWandContiguous: s.magicWandContiguous,
      setMagicWandContiguous: s.setMagicWandContiguous,
      gradientEndColor: s.gradientEndColor,
      setGradientEndColor: s.setGradientEndColor,
      gradientMode: s.gradientMode,
      setGradientMode: s.setGradientMode,
      cropAspectRatio: s.cropAspectRatio,
      setCropAspectRatio: s.setCropAspectRatio,
    }))
  );

  const [showFilters, setShowFilters] = useState(false);
  const [activeColorPicker, setActiveColorPicker] = useState<ColorPickerTarget | null>(null);
  const colorPickerPanelRef = useRef<HTMLDivElement>(null);
  const eyedropperButtonRef = useRef<HTMLButtonElement>(null);
  const gradientStartButtonRef = useRef<HTMLButtonElement>(null);
  const gradientEndButtonRef = useRef<HTMLButtonElement>(null);
  const colorPickerSvRef = useRef<HTMLDivElement>(null);
  const colorPickerHueRef = useRef<HTMLDivElement>(null);
  const colorPickerDragModeRef = useRef<"sv" | "hue" | null>(null);
  const activeColorPickerRef = useRef<ColorPickerTarget | null>(null);
  const [colorPickerPanelPos, setColorPickerPanelPos] = useState({ top: 8, left: 64 });
  const [colorPickerStartColor, setColorPickerStartColor] = useState(brushColor);

  const isBrushTool =
    activeTool === "brush" ||
    activeTool === "eraser" ||
    activeTool === "mask-brush" ||
    activeTool === "mask-eraser" ||
    activeTool === "clone-stamp" ||
    activeTool === "healing-brush";

  const isTextTool = activeTool === "text";
  const isMagicWand = activeTool === "magic-wand";
  const isEyedropper = activeTool === "eyedropper";
  const isGradient = activeTool === "gradient";
  const isCrop = activeTool === "crop";

  const pickerColor = activeColorPicker === "gradient-end" ? gradientEndColor : brushColor;
  const rgb = useMemo(() => hexToRgb(pickerColor), [pickerColor]);
  const hsv = useMemo(() => rgbToHsv(rgb), [rgb]);
  const hsvRef = useRef(hsv);

  const getTargetColor = useCallback(
    (target: ColorPickerTarget) => (target === "gradient-end" ? gradientEndColor : brushColor),
    [brushColor, gradientEndColor],
  );

  const setPickerColor = useCallback(
    (color: string) => {
      if (activeColorPicker === "gradient-end") setGradientEndColor(color);
      else setBrushColor(color);
    },
    [activeColorPicker, setBrushColor, setGradientEndColor],
  );

  const getTargetButton = useCallback((target: ColorPickerTarget) => {
    if (target === "eyedropper") return eyedropperButtonRef.current;
    if (target === "gradient-start") return gradientStartButtonRef.current;
    return gradientEndButtonRef.current;
  }, []);

  const recalcColorPickerPanelPos = useCallback(
    (target: ColorPickerTarget | null = activeColorPickerRef.current) => {
      if (!target) return;
      const button = getTargetButton(target);
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const panelWidth = 288; // Tailwind w-72
      const gap = 8;
      let left = rect.right + gap;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, rect.left - panelWidth - gap);
      }
      const top = Math.max(8, Math.min(window.innerHeight - 420, rect.top));
      setColorPickerPanelPos({ top, left });
    },
    [getTargetButton],
  );

  const toggleColorPicker = useCallback(
    (target: ColorPickerTarget) => {
      if (activeColorPicker === target) {
        setActiveColorPicker(null);
        return;
      }
      activeColorPickerRef.current = target;
      setColorPickerStartColor(getTargetColor(target));
      recalcColorPickerPanelPos(target);
      setActiveColorPicker(target);
    },
    [activeColorPicker, getTargetColor, recalcColorPickerPanelPos],
  );

  useEffect(() => {
    hsvRef.current = hsv;
  }, [hsv]);

  useEffect(() => {
    activeColorPickerRef.current = activeColorPicker;
  }, [activeColorPicker]);

  useEffect(() => {
    if (!activeColorPicker) return;
    if (activeColorPicker === "eyedropper" && !isEyedropper) setActiveColorPicker(null);
    if (
      (activeColorPicker === "gradient-start" || activeColorPicker === "gradient-end") &&
      !isGradient
    ) {
      setActiveColorPicker(null);
    }
  }, [activeColorPicker, isEyedropper, isGradient]);

  useEffect(() => {
    if (!activeColorPicker) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const clickedPanel = !!colorPickerPanelRef.current?.contains(target);
      const clickedButton =
        !!eyedropperButtonRef.current?.contains(target) ||
        !!gradientStartButtonRef.current?.contains(target) ||
        !!gradientEndButtonRef.current?.contains(target);
      if (!clickedPanel && !clickedButton) {
        setActiveColorPicker(null);
      }
    };
    const onViewportChange = () => recalcColorPickerPanelPos(activeColorPickerRef.current);
    const onPointerMove = (event: PointerEvent) => {
      if (colorPickerDragModeRef.current === "sv") {
        updateSvFromClientPoint(event.clientX, event.clientY);
      } else if (colorPickerDragModeRef.current === "hue") {
        updateHueFromClientPoint(event.clientY);
      }
    };
    const onPointerUp = () => {
      colorPickerDragModeRef.current = null;
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [activeColorPicker, recalcColorPickerPanelPos]);

  const updateRgb = (updates: Partial<Rgb>) => {
    setPickerColor(
      rgbToHex({
        r: updates.r ?? rgb.r,
        g: updates.g ?? rgb.g,
        b: updates.b ?? rgb.b,
      }),
    );
  };

  const updateHsv = (updates: Partial<Hsv>) => {
    setPickerColor(
      rgbToHex(
        hsvToRgb({
          h: updates.h ?? hsv.h,
          s: updates.s ?? hsv.s,
          v: updates.v ?? hsv.v,
        }),
      ),
    );
  };

  const updateSvFromClientPoint = (clientX: number, clientY: number) => {
    const svEl = colorPickerSvRef.current;
    if (!svEl) return;
    const rect = svEl.getBoundingClientRect();
    const x = clampFloat(clientX - rect.left, 0, rect.width);
    const y = clampFloat(clientY - rect.top, 0, rect.height);
    const s = rect.width === 0 ? 0 : (x / rect.width) * 100;
    const v = rect.height === 0 ? 0 : 100 - (y / rect.height) * 100;
    setPickerColor(
      rgbToHex(
        hsvToRgb({
          h: hsvRef.current.h,
          s,
          v,
        }),
      ),
    );
  };

  const updateHueFromClientPoint = (clientY: number) => {
    const hueEl = colorPickerHueRef.current;
    if (!hueEl) return;
    const rect = hueEl.getBoundingClientRect();
    const y = clampFloat(clientY - rect.top, 0, rect.height);
    const h = rect.height === 0 ? 0 : (y / rect.height) * 360;
    setPickerColor(
      rgbToHex(
        hsvToRgb({
          h,
          s: hsvRef.current.s,
          v: hsvRef.current.v,
        }),
      ),
    );
  };

  return (
    <>
      <div className="w-12 bg-card border-r border-border flex flex-col items-center py-2 gap-0.5 overflow-y-auto overflow-x-hidden">
        {mainTools.map((tool, idx) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <div key={tool.id}>
              {tool.separator && idx > 0 && (
                <div className="w-7 h-px bg-border my-1 mx-auto" />
              )}
              <button
                title={tool.label}
                onClick={() => setActiveTool(tool.id)}
                className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors ${
                  isActive
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {/* Filters button */}
        <div className="w-7 h-px bg-border my-1" />
        <button
          title="Filters Gallery (F)"
          onClick={() => setShowFilters(true)}
          className="w-9 h-9 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Sparkles className="w-4 h-4" />
        </button>

        {/* Mask tools separator */}
        {editingMaskLayerId && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="text-[8px] text-primary uppercase tracking-widest mb-0.5">
              Mask
            </div>
            {maskTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  title={tool.label}
                  onClick={() => setActiveTool(tool.id)}
                  className={`w-9 h-9 flex items-center justify-center rounded-md transition-colors relative ${
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {/* Tiny color indicator: white for brush, black for eraser */}
                  <div
                    className={`absolute bottom-0.5 right-0.5 w-2 h-2 rounded-full border border-border ${
                      tool.id === "mask-brush" ? "bg-white" : "bg-black"
                    }`}
                  />
                </button>
              );
            })}
          </>
        )}

        {/* Brush/tool controls */}
        {isBrushTool && (
          <>
            <div className="w-7 h-px bg-border my-1" />

            {/* Brush preview */}
            <div className="w-9 h-9 flex items-center justify-center" title={`Size: ${brushSize}px`}>
              <div
                className="rounded-full border border-muted-foreground/40"
                style={{
                  width: Math.max(4, Math.min(28, brushSize * 0.8)),
                  height: Math.max(4, Math.min(28, brushSize * 0.8)),
                  backgroundColor:
                    activeTool === "mask-eraser"
                      ? "black"
                      : activeTool === "mask-brush"
                      ? "white"
                      : activeTool === "eraser"
                      ? "rgba(128,128,128,0.3)"
                      : activeTool === "clone-stamp" || activeTool === "healing-brush"
                      ? "rgba(62,207,142,0.4)"
                      : "currentColor",
                }}
              />
            </div>

            {/* Size buttons */}
            <button
              onClick={() => setBrushSize(Math.max(1, brushSize - 5))}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
              title="Decrease size"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-muted-foreground">{brushSize}</span>
            <button
              onClick={() => setBrushSize(Math.min(200, brushSize + 5))}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
              title="Increase size"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Hardness */}
            <div className="w-7 h-px bg-border my-0.5" />
            <CircleDot className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">{brushHardness}%</span>

            {/* Color picker for brush tool */}
            {activeTool === "brush" && (
              <>
                <div className="w-7 h-px bg-border my-0.5" />
                <input
                  type="color"
                  value={brushColor}
                  onChange={(e) => setBrushColor(e.target.value)}
                  className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
                  title="Brush color"
                />
              </>
            )}

            {/* Clone stamp indicator */}
            {(activeTool === "clone-stamp" || activeTool === "healing-brush") && (
              <div className="text-[8px] text-primary text-center mt-1 px-0.5 leading-tight">
                Alt+Click to set source
              </div>
            )}
          </>
        )}

        {/* Text tool controls */}
        {isTextTool && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="w-full px-1">
              <Suspense fallback={null}>
                <TextToolPanel />
              </Suspense>
            </div>
          </>
        )}

        {/* Magic Wand controls */}
        {isMagicWand && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="text-[8px] text-primary uppercase tracking-widest mb-0.5">
              Magic Wand
            </div>
            <div className="w-9 h-9 flex items-center justify-center" title={`Tolerance: ${magicWandTolerance}`}>
              <div
                className="rounded-full border border-muted-foreground/40"
                style={{
                  width: Math.max(4, Math.min(28, magicWandTolerance * 0.8)),
                  height: Math.max(4, Math.min(28, magicWandTolerance * 0.8)),
                  backgroundColor:
                    "rgba(62,207,142,0.4)",
                }}
              />
            </div>

            {/* Tolerance buttons */}
            <button
              onClick={() => setMagicWandTolerance(Math.max(1, magicWandTolerance - 5))}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
              title="Decrease tolerance"
            >
              <Minus className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-muted-foreground">{magicWandTolerance}</span>
            <button
              onClick={() => setMagicWandTolerance(Math.min(200, magicWandTolerance + 5))}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
              title="Increase tolerance"
            >
              <Plus className="w-3 h-3" />
            </button>

            {/* Contiguous */}
            <div className="w-7 h-px bg-border my-0.5" />
            <CircleDot className="w-3 h-3 text-muted-foreground" />
            <span className="text-[9px] text-muted-foreground">{magicWandContiguous ? "Contiguous" : "Non-Contiguous"}</span>

            {/* Contiguous toggle */}
            <div className="w-7 h-px bg-border my-0.5" />
            <button
              onClick={() => setMagicWandContiguous(!magicWandContiguous)}
              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground rounded hover:bg-accent transition-colors"
              title="Toggle contiguous"
            >
              <CircleDot className="w-3 h-3" />
            </button>
          </>
        )}

        {/* Eyedropper color controls */}
        {isEyedropper && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div>
              <button
                ref={eyedropperButtonRef}
                onClick={() => toggleColorPicker("eyedropper")}
                className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
                title="Fine-tune sampled color"
              >
                <div
                  className="w-6 h-6 rounded border border-border shadow-sm"
                  style={{ backgroundColor: brushColor }}
                />
              </button>
            </div>
          </>
        )}

        {/* Gradient tool controls */}
        {isGradient && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setGradientMode("linear")}
                className={`w-[18px] h-[18px] flex items-center justify-center rounded transition-colors ${
                  gradientMode === "linear"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                title="Linear gradient"
              >
                <Blend className="w-3 h-3" />
              </button>
              <button
                onClick={() => setGradientMode("radial")}
                className={`w-[18px] h-[18px] flex items-center justify-center rounded transition-colors ${
                  gradientMode === "radial"
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                title="Radial gradient"
              >
                <Circle className="w-3 h-3" />
              </button>
            </div>
            <div className="w-7 h-px bg-border my-0.5" />
            <button
              ref={gradientStartButtonRef}
              onClick={() => toggleColorPicker("gradient-start")}
              className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              title="Gradient start color"
            >
              <div
                className="w-6 h-6 rounded border border-border shadow-sm"
                style={{ backgroundColor: brushColor }}
              />
            </button>
            <button
              ref={gradientEndButtonRef}
              onClick={() => toggleColorPicker("gradient-end")}
              className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-accent transition-colors"
              title="Gradient end color"
            >
              <div
                className="w-6 h-6 rounded border border-border shadow-sm"
                style={{ backgroundColor: gradientEndColor }}
              />
            </button>
          </>
        )}

        {/* Crop tool info */}
        {isCrop && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="text-[8px] text-primary uppercase tracking-widest mb-0.5">
              Crop
            </div>
            <div className="text-[8px] text-muted-foreground text-center px-0.5 leading-tight mb-1">
              Drag to define crop area
            </div>
            <div className="w-7 h-px bg-border my-0.5" />
            <div className="text-[7px] text-muted-foreground uppercase tracking-wider mb-0.5">
              Ratio
            </div>
            {([
              { label: "Free", value: null },
              { label: "1:1", value: 1 },
              { label: "4:3", value: 4 / 3 },
              { label: "16:9", value: 16 / 9 },
              { label: "3:2", value: 3 / 2 },
              { label: "2:3", value: 2 / 3 },
              { label: "9:16", value: 9 / 16 },
            ] as { label: string; value: CropAspectRatio }[]).map((ar) => (
              <button
                key={ar.label}
                onClick={() => setCropAspectRatio(ar.value)}
                className={`w-9 h-5 flex items-center justify-center rounded text-[8px] transition-colors ${
                  cropAspectRatio === ar.value
                    ? "bg-primary/20 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                }`}
                title={`Aspect ratio: ${ar.label}`}
              >
                {ar.label}
              </button>
            ))}
          </>
        )}
      </div>

      {/* Filters Gallery Modal */}
      <FiltersGallery open={showFilters} onClose={() => setShowFilters(false)} />

      {activeColorPicker &&
        createPortal(
          <div
            ref={colorPickerPanelRef}
            className="fixed z-[100] w-72 rounded-md border border-border bg-card shadow-xl p-2.5 space-y-2.5"
            style={{ top: colorPickerPanelPos.top, left: colorPickerPanelPos.left }}
          >
            <div className="text-[10px] text-primary uppercase tracking-[0.14em]">
              {activeColorPicker === "eyedropper"
                ? "Eyedropper Color"
                : activeColorPicker === "gradient-start"
                ? "Gradient Start"
                : "Gradient End"}
            </div>

            <div className="flex items-start gap-2">
              <div
                ref={colorPickerSvRef}
                onPointerDown={(event) => {
                  event.preventDefault();
                  colorPickerDragModeRef.current = "sv";
                  updateSvFromClientPoint(event.clientX, event.clientY);
                }}
                className="relative h-40 flex-1 rounded border border-border cursor-crosshair touch-none overflow-hidden"
                style={{ backgroundColor: `hsl(${hsv.h}, 100%, 50%)` }}
                title="Saturation / Value"
              >
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to right, #ffffff, rgba(255,255,255,0))" }}
                />
                <div
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0), #000000)" }}
                />
                <div
                  className="pointer-events-none absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.55)] -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${hsv.s}%`, top: `${100 - hsv.v}%` }}
                />
              </div>

              <div
                ref={colorPickerHueRef}
                onPointerDown={(event) => {
                  event.preventDefault();
                  colorPickerDragModeRef.current = "hue";
                  updateHueFromClientPoint(event.clientY);
                }}
                className="relative h-40 w-4 rounded border border-border cursor-ns-resize touch-none overflow-hidden"
                style={{
                  background:
                    "linear-gradient(to bottom, #ff0000 0%, #ffff00 16%, #00ff00 33%, #00ffff 50%, #0000ff 66%, #ff00ff 83%, #ff0000 100%)",
                }}
                title="Hue"
              >
                <div
                  className="pointer-events-none absolute left-0 right-0 h-[3px] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)] -translate-y-1/2"
                  style={{ top: `${(clampFloat(hsv.h, 0, 360) / 360) * 100}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPickerColor(pickerColor)}
                className="rounded border border-border bg-secondary/35 px-2 py-1.5 text-left"
                title="New color"
              >
                <div className="text-[10px] text-muted-foreground mb-1">new</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded border border-border shrink-0"
                    style={{ backgroundColor: pickerColor }}
                  />
                  <span className="text-[11px] font-mono">{pickerColor.toUpperCase()}</span>
                </div>
              </button>
              <button
                onClick={() => setPickerColor(colorPickerStartColor)}
                className="rounded border border-border bg-secondary/35 px-2 py-1.5 text-left hover:bg-secondary/60 transition-colors"
                title="Restore color from when the picker was opened"
              >
                <div className="text-[10px] text-muted-foreground mb-1">current</div>
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded border border-border shrink-0"
                    style={{ backgroundColor: colorPickerStartColor }}
                  />
                  <span className="text-[11px] font-mono">{colorPickerStartColor.toUpperCase()}</span>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <div className="grid grid-cols-[12px_1fr_16px] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">H</span>
                  <input
                    type="number"
                    min={0}
                    max={360}
                    value={hsv.h}
                    onChange={(e) => updateHsv({ h: clampInt(Number(e.target.value), 0, 360) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                  <span className="text-muted-foreground text-center">°</span>
                </div>
                <div className="grid grid-cols-[12px_1fr_16px] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">S</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={hsv.s}
                    onChange={(e) => updateHsv({ s: clampInt(Number(e.target.value), 0, 100) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                  <span className="text-muted-foreground text-center">%</span>
                </div>
                <div className="grid grid-cols-[12px_1fr_16px] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">V</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={hsv.v}
                    onChange={(e) => updateHsv({ v: clampInt(Number(e.target.value), 0, 100) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                  <span className="text-muted-foreground text-center">%</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="grid grid-cols-[12px_1fr] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">R</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.r}
                    onChange={(e) => updateRgb({ r: clampInt(Number(e.target.value), 0, 255) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                </div>
                <div className="grid grid-cols-[12px_1fr] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">G</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.g}
                    onChange={(e) => updateRgb({ g: clampInt(Number(e.target.value), 0, 255) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                </div>
                <div className="grid grid-cols-[12px_1fr] items-center gap-1 text-[11px]">
                  <span className="text-muted-foreground">B</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={rgb.b}
                    onChange={(e) => updateRgb({ b: clampInt(Number(e.target.value), 0, 255) })}
                    className="h-7 px-1 rounded border border-border bg-secondary"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-[12px_1fr] items-center gap-1 text-[11px]">
              <span className="text-muted-foreground text-center">#</span>
              <input
                type="text"
                value={pickerColor.replace(/^#/, "").toUpperCase()}
                onChange={(e) => {
                  const cleaned = e.target.value.trim().replace(/^#/, "");
                  if (/^[0-9a-fA-F]{3}$/.test(cleaned) || /^[0-9a-fA-F]{6}$/.test(cleaned)) {
                    setPickerColor(`#${cleaned}`);
                  }
                }}
                className="h-7 px-2 rounded border border-border bg-secondary font-mono"
                title="HEX color"
              />
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
