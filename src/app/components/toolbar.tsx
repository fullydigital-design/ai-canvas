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
import { useEditor, type Tool, type GradientMode, type CropAspectRatio } from "./editor-store";
import { useState } from "react";
import { TextToolPanel } from "./text-tool-panel";
import { FiltersGallery } from "./filters-gallery";

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
  } = useEditor();

  const [showFilters, setShowFilters] = useState(false);

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

  return (
    <>
      <div className="w-12 bg-card border-r border-border flex flex-col items-center py-2 gap-0.5 overflow-y-auto">
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
              <TextToolPanel />
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

        {/* Eyedropper info */}
        {isEyedropper && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="text-[8px] text-primary uppercase tracking-widest mb-0.5">
              Eyedropper
            </div>
            <div className="w-9 h-9 flex items-center justify-center">
              <div
                className="w-6 h-6 rounded border border-border shadow-sm"
                style={{ backgroundColor: brushColor }}
              />
            </div>
            <div className="text-[8px] text-muted-foreground text-center px-0.5 leading-tight">
              Click to sample color
            </div>
          </>
        )}

        {/* Gradient tool controls */}
        {isGradient && (
          <>
            <div className="w-7 h-px bg-border my-1" />
            <div className="text-[8px] text-primary uppercase tracking-widest mb-0.5">
              Gradient
            </div>
            {/* Mode toggle */}
            <div className="flex items-center gap-0.5 mb-1">
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
            <span className="text-[8px] text-muted-foreground">{gradientMode === "linear" ? "Linear" : "Radial"}</span>
            <div className="text-[8px] text-muted-foreground text-center px-0.5 leading-tight">
              Click & drag to create gradient
            </div>
            <div className="w-7 h-px bg-border my-0.5" />
            <input
              type="color"
              value={brushColor}
              onChange={(e) => setBrushColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
              title="Gradient start color"
            />
            <span className="text-[8px] text-muted-foreground">Start</span>
            <div className="w-7 h-px bg-border my-0.5" />
            <input
              type="color"
              value={gradientEndColor}
              onChange={(e) => setGradientEndColor(e.target.value)}
              className="w-7 h-7 rounded cursor-pointer border border-border bg-transparent"
              title="Gradient end color"
            />
            <span className="text-[8px] text-muted-foreground">End</span>
            {/* Gradient preview */}
            <div className="w-7 h-px bg-border my-0.5" />
            <div
              className="w-7 h-4 rounded border border-border"
              style={{
                background: gradientMode === "linear"
                  ? `linear-gradient(to right, ${brushColor}, ${gradientEndColor})`
                  : `radial-gradient(circle, ${brushColor}, ${gradientEndColor})`,
              }}
              title="Gradient preview"
            />
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
    </>
  );
}