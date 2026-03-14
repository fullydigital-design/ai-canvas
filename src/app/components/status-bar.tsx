/**
 * Status Bar — shows cursor position, zoom, canvas size, active tool,
 * active layer info, selection dimensions, and sampled color.
 */
import { useEditor, type Tool } from "./editor-store";
import { useState, useEffect } from "react";

const TOOL_LABELS: Record<Tool, string> = {
  select: "Select",
  move: "Move",
  "rectangle-select": "Rect Select",
  lasso: "Lasso",
  "magic-wand": "Magic Wand",
  brush: "Brush",
  eraser: "Eraser",
  "clone-stamp": "Clone Stamp",
  "healing-brush": "Healing Brush",
  hand: "Pan",
  zoom: "Zoom",
  transform: "Transform",
  text: "Text",
  "mask-brush": "Mask Brush",
  "mask-eraser": "Mask Eraser",
  eyedropper: "Eyedropper",
  gradient: "Gradient",
  crop: "Crop",
};

export function StatusBar() {
  const {
    activeTool,
    canvasZoom,
    canvasWidth,
    canvasHeight,
    activeLayerId,
    layers,
    selection,
    brushSize,
    brushColor,
  } = useEditor();

  // Listen for mouse position events dispatched from InfiniteCanvas
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [sampledColor, setSampledColor] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        setMousePos({ x: detail.x, y: detail.y });
        if (detail.sampledColor) setSampledColor(detail.sampledColor);
      }
    };
    window.addEventListener("canvas-mouse-position", handler);
    return () => window.removeEventListener("canvas-mouse-position", handler);
  }, []);

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const layerCount = layers.length;
  const visibleCount = layers.filter((l) => l.visible).length;

  return (
    <div className="h-6 bg-card border-t border-border flex items-center px-3 gap-4 text-[10px] text-muted-foreground shrink-0 select-none">
      {/* Active tool */}
      <div className="flex items-center gap-1.5">
        <span className="text-primary">{TOOL_LABELS[activeTool]}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Cursor position */}
      <div className="flex items-center gap-1">
        <span>X:</span>
        <span className="text-foreground w-8 text-right">{Math.round(mousePos.x)}</span>
        <span className="ml-1">Y:</span>
        <span className="text-foreground w-8 text-right">{Math.round(mousePos.y)}</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Canvas info */}
      <div className="flex items-center gap-1">
        <span>{canvasWidth} x {canvasHeight}</span>
        <span className="text-primary ml-1">{Math.round(canvasZoom * 100)}%</span>
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Active layer */}
      <div className="flex items-center gap-1 truncate max-w-[120px]">
        <span className="truncate">
          {activeLayer ? activeLayer.name : "No layer"}
        </span>
        {activeLayer && (
          <span className="text-muted-foreground/60">{activeLayer.opacity}%</span>
        )}
      </div>

      <div className="w-px h-3 bg-border" />

      {/* Layer count */}
      <div className="flex items-center gap-1">
        <span>{visibleCount}/{layerCount} layers</span>
      </div>

      {/* Selection size */}
      {selection && (
        <>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1">
            <span>Sel:</span>
            <span className="text-foreground">
              {Math.round(selection.width)} x {Math.round(selection.height)}
            </span>
          </div>
        </>
      )}

      {/* Brush info for brush tools */}
      {(activeTool === "brush" || activeTool === "eraser") && (
        <>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1">
            <span>Size: {brushSize}px</span>
          </div>
        </>
      )}

      {/* Sampled color for eyedropper */}
      {activeTool === "eyedropper" && sampledColor && (
        <>
          <div className="w-px h-3 bg-border" />
          <div className="flex items-center gap-1.5">
            <div
              className="w-3 h-3 rounded-sm border border-border"
              style={{ backgroundColor: sampledColor }}
            />
            <span className="text-foreground font-mono">{sampledColor.toUpperCase()}</span>
          </div>
        </>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Color swatch */}
      <div className="flex items-center gap-1.5">
        <div
          className="w-3.5 h-3.5 rounded-sm border border-border"
          style={{ backgroundColor: brushColor }}
        />
        <span className="font-mono">{brushColor.toUpperCase()}</span>
      </div>
    </div>
  );
}
