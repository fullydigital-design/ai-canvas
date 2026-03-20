import { useRef, useEffect, useState } from "react";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Plus,
  Trash2,
  Image,
  Square,
  Sparkles,
  Layers,
  ChevronUp,
  ChevronDown,
  CircleDot,
  PaintBucket,
  X,
  Palette,
  Type,
} from "lucide-react";
import {
  useEditorSelector,
  type Layer,
  type BlenderPassType,
  getLayerMaskDataUrl,
  layerHasMask,
} from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";
import { useShallow } from "zustand/react/shallow";

// Preset color palette for fill layers
const FILL_COLOR_PRESETS = [
  "#ffffff", "#000000", "#f44336", "#e91e63", "#9c27b0",
  "#673ab7", "#3f51b5", "#2196f3", "#03a9f4", "#00bcd4",
  "#009688", "#4caf50", "#8bc34a", "#cddc39", "#ffeb3b",
  "#ffc107", "#ff9800", "#ff5722", "#795548", "#607d8b",
];

const BLENDER_PASS_LABELS: Record<BlenderPassType, string> = {
  beauty: "Beauty",
  albedo: "Albedo",
  normal: "Normal",
  depth: "Depth",
  object_id: "Object ID",
  material_id: "Material ID",
  custom: "Custom",
};

const METADATA_ORDER = [
  "scene",
  "camera",
  "frame",
  "resolution",
  "engine",
  "seed",
];

// Small mask thumbnail renderer
function MaskThumbnail({
  maskData,
  width,
  height,
}: {
  maskData: string;
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const img = new window.Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Checkerboard background
      const tile = 3;
      for (let y = 0; y < canvas.height; y += tile) {
        for (let x = 0; x < canvas.width; x += tile) {
          ctx.fillStyle =
            ((x / tile + y / tile) % 2 === 0) ? "#444" : "#333";
          ctx.fillRect(x, y, tile, tile);
        }
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = maskData;
  }, [maskData]);

  return (
    <canvas
      ref={canvasRef}
      width={24}
      height={24}
      className="rounded border border-border shrink-0"
      style={{ width: 24, height: 24, imageRendering: "pixelated" }}
    />
  );
}

export function LayersPanel() {
  const {
    layers,
    activeLayerId,
    setActiveLayerId,
    addLayer,
    removeLayer,
    updateLayer,
    updateLayerSilent,
    pushHistory,
    reorderLayers,
    canvasWidth,
    canvasHeight,
    editingMaskLayerId,
    setEditingMaskLayerId,
    addMaskToLayer,
    removeMaskFromLayer,
    activeTool,
    setActiveTool,
  } = useEditorSelector(
    useShallow((s) => ({
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      setActiveLayerId: s.setActiveLayerId,
      addLayer: s.addLayer,
      removeLayer: s.removeLayer,
      updateLayer: s.updateLayer,
      updateLayerSilent: s.updateLayerSilent,
      pushHistory: s.pushHistory,
      reorderLayers: s.reorderLayers,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      editingMaskLayerId: s.editingMaskLayerId,
      setEditingMaskLayerId: s.setEditingMaskLayerId,
      addMaskToLayer: s.addMaskToLayer,
      removeMaskFromLayer: s.removeMaskFromLayer,
      activeTool: s.activeTool,
      setActiveTool: s.setActiveTool,
    }))
  );

  const [showColorPicker, setShowColorPicker] = useState(false);
  const seenBlenderGroups = new Set<string>();

  // Close color picker when switching to a different layer
  useEffect(() => {
    setShowColorPicker(false);
  }, [activeLayerId]);

  const handleAddLayer = () => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: `Layer ${layers.length + 1}`,
      visible: true,
      locked: false,
      opacity: 100,
      type: "fill",
      blendMode: "normal",
      x: 0,
      y: 0,
      width: canvasWidth,
      height: canvasHeight,
      fillColor: "#ffffff",
    };
    addLayer(newLayer);
  };

  const getLayerIcon = (type: Layer["type"]) => {
    switch (type) {
      case "image":
        return Image;
      case "ai-generated":
        return Sparkles;
      case "mask":
        return CircleDot;
      case "text":
        return Type;
      default:
        return Square;
    }
  };

  const moveLayer = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= layers.length) return;
    reorderLayers(index, newIndex);
  };

  const handleToggleMaskEdit = (layerId: string) => {
    if (editingMaskLayerId === layerId) {
      setEditingMaskLayerId(null);
      // Switch back to a normal tool
      if (activeTool === "mask-brush" || activeTool === "mask-eraser") {
        setActiveTool("move");
      }
    } else {
      setEditingMaskLayerId(layerId);
      setActiveLayerId(layerId);
      setActiveTool("mask-brush");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Layers className="w-3.5 h-3.5" />
          <span className="text-xs uppercase tracking-wider">Layers</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleAddLayer}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Add Layer"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => activeLayerId && removeLayer(activeLayerId)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-destructive transition-colors"
            title="Delete Layer"
            disabled={!activeLayerId || layers.length <= 1}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Mask editing indicator */}
      {editingMaskLayerId && (
        <div className="px-3 py-1.5 bg-primary/10 border-b border-primary/20 flex items-center gap-2">
          <CircleDot className="w-3 h-3 text-primary" />
          <span className="text-[10px] text-primary flex-1">
            Editing mask:{" "}
            {layers.find((l) => l.id === editingMaskLayerId)?.name}
          </span>
          <button
            onClick={() => {
              setEditingMaskLayerId(null);
              if (activeTool === "mask-brush" || activeTool === "mask-eraser") {
                setActiveTool("move");
              }
            }}
            className="text-primary hover:text-foreground"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {layers.map((layer, index) => {
          const LayerIcon = getLayerIcon(layer.type);
          const isActive = layer.id === activeLayerId;
          const isEditingMask = layer.id === editingMaskLayerId;
          const hasMask = layerHasMask(layer);
          const showGroupHeader = !!layer.blenderGroupId && !seenBlenderGroups.has(layer.blenderGroupId);
          if (layer.blenderGroupId) {
            seenBlenderGroups.add(layer.blenderGroupId);
          }
          const passLabel = layer.blenderPassType ? BLENDER_PASS_LABELS[layer.blenderPassType] : null;

          return (
            <div key={layer.id}>
              {showGroupHeader && (
                <div className="px-3 py-1 text-[10px] uppercase tracking-wider text-primary/80 border-b border-border/50 bg-primary/5 truncate">
                  {layer.blenderGroupName || "Blender Pass Set"}
                </div>
              )}
              {/* Layer row */}
              <div
                onClick={() => setActiveLayerId(layer.id)}
                className={`flex items-center gap-2 px-3 py-1.5 border-b border-border/50 cursor-pointer transition-colors ${
                  isActive
                    ? "bg-primary/10 border-l-2 border-l-primary"
                    : "hover:bg-accent/50"
                }`}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateLayer(layer.id, { visible: !layer.visible });
                  }}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {layer.visible ? (
                    <Eye className="w-3.5 h-3.5" />
                  ) : (
                    <EyeOff className="w-3.5 h-3.5" />
                  )}
                </button>
                {layer.type === "fill" ? (
                  <span
                    className="w-3.5 h-3.5 rounded-sm border border-border/80 shrink-0"
                    style={{ backgroundColor: layer.fillColor || "#ffffff" }}
                  />
                ) : (
                  <LayerIcon className="w-3.5 h-3.5 text-muted-foreground" />
                )}
                <span className="flex-1 text-xs truncate">{layer.name}</span>
                {passLabel && (
                  <span className="text-[9px] px-1 py-0.5 rounded border border-primary/30 text-primary/90 bg-primary/10 shrink-0">
                    {passLabel}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {layer.opacity}%
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(index, "up");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={index === 0}
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(index, "down");
                    }}
                    className="text-muted-foreground hover:text-foreground"
                    disabled={index === layers.length - 1}
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { locked: !layer.locked });
                    }}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {layer.locked ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>

              {/* Mask sub-row */}
              {hasMask && (
                <div
                  className={`flex items-center gap-2 pl-8 pr-3 py-1 border-b border-border/30 cursor-pointer transition-colors ${
                    isEditingMask
                      ? "bg-primary/5 border-l-2 border-l-primary/50"
                      : "hover:bg-accent/30"
                  }`}
                  onClick={() => handleToggleMaskEdit(layer.id)}
                >
                  <MaskThumbnail
                    maskData={getLayerMaskDataUrl(layer) || ""}
                    width={layer.width}
                    height={layer.height}
                  />
                  <span
                    className={`text-[10px] flex-1 ${
                      isEditingMask ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    Mask
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, {
                        maskEnabled: !layer.maskEnabled,
                      });
                    }}
                    className={`text-[10px] px-1 py-0.5 rounded ${
                      layer.maskEnabled
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground bg-secondary"
                    }`}
                    title={
                      layer.maskEnabled ? "Disable mask" : "Enable mask"
                    }
                  >
                    {layer.maskEnabled ? "ON" : "OFF"}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMaskFromLayer(layer.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    title="Delete mask"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Layer properties */}
      {activeLayerId &&
        (() => {
          const layer = layers.find((l) => l.id === activeLayerId);
          if (!layer) return null;
          return (
            <div className="border-t border-border px-3 py-2 space-y-2">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Properties
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-14">
                  Opacity
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={layer.opacity}
                  onChange={(e) =>
                    updateLayerSilent(layer.id, {
                      opacity: Number(e.target.value),
                    })
                  }
                  onPointerUp={() => pushHistory()}
                  className="flex-1 accent-primary h-1"
                />
                <span className="text-xs w-8 text-right">
                  {layer.opacity}%
                </span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-14">
                  Blend
                </label>
                <select
                  value={layer.blendMode}
                  onChange={(e) =>
                    updateLayer(layer.id, { blendMode: e.target.value })
                  }
                  className="flex-1 bg-secondary text-foreground text-xs rounded px-1.5 py-1 border border-border"
                >
                  <option value="normal">Normal</option>
                  <option value="multiply">Multiply</option>
                  <option value="screen">Screen</option>
                  <option value="overlay">Overlay</option>
                  <option value="darken">Darken</option>
                  <option value="lighten">Lighten</option>
                  <option value="color-dodge">Color Dodge</option>
                  <option value="color-burn">Color Burn</option>
                  <option value="soft-light">Soft Light</option>
                  <option value="hard-light">Hard Light</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">X</span>
                  <input
                    type="number"
                    value={Math.round(layer.x)}
                    onChange={(e) =>
                      updateLayer(layer.id, { x: Number(e.target.value) })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Y</span>
                  <input
                    type="number"
                    value={Math.round(layer.y)}
                    onChange={(e) =>
                      updateLayer(layer.id, { y: Number(e.target.value) })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">W</span>
                  <input
                    type="number"
                    value={Math.round(layer.width)}
                    onChange={(e) =>
                      updateLayer(layer.id, {
                        width: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">H</span>
                  <input
                    type="number"
                    value={Math.round(layer.height)}
                    onChange={(e) =>
                      updateLayer(layer.id, {
                        height: Number(e.target.value),
                      })
                    }
                    className="w-full bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  />
                </div>
              </div>

              {/* Fill color controls (for fill layers) */}
              {layer.type === "fill" && (
                <div className="pt-1 border-t border-border/50 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground w-14">
                      Fill
                    </label>
                    <div className="flex items-center gap-1.5 flex-1">
                      <div className="relative">
                        <button
                          onClick={() => setShowColorPicker(!showColorPicker)}
                          className="w-6 h-6 rounded border border-border shadow-sm transition-transform hover:scale-110"
                          style={{ backgroundColor: layer.fillColor || "#ffffff" }}
                          title="Pick fill color"
                        />
                      </div>
                      <input
                        type="text"
                        value={(layer.fillColor || "#ffffff").toUpperCase()}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{0,6}$/.test(val)) {
                            updateLayer(layer.id, { fillColor: val });
                          }
                        }}
                        onBlur={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{6}$/.test(val)) {
                            updateLayer(layer.id, { fillColor: val });
                          }
                        }}
                        className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border font-mono"
                        maxLength={7}
                      />
                      <input
                        type="color"
                        value={layer.fillColor || "#ffffff"}
                        onChange={(e) =>
                          updateLayer(layer.id, { fillColor: e.target.value })
                        }
                        className="w-0 h-0 opacity-0 absolute"
                        id={`color-native-${layer.id}`}
                      />
                      <button
                        onClick={() => {
                          document
                            .getElementById(`color-native-${layer.id}`)
                            ?.click();
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        title="Open system color picker"
                      >
                        <Palette className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  {showColorPicker && (
                    <div className="grid grid-cols-10 gap-0.5">
                      {FILL_COLOR_PRESETS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            updateLayer(layer.id, { fillColor: color });
                            setShowColorPicker(false);
                          }}
                          className={`w-full aspect-square rounded-sm border transition-transform hover:scale-125 hover:z-10 ${
                            (layer.fillColor || "#ffffff").toLowerCase() ===
                            color.toLowerCase()
                              ? "border-primary ring-1 ring-primary scale-110"
                              : "border-border/50"
                          }`}
                          style={{ backgroundColor: color }}
                          title={color.toUpperCase()}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {(layer.blenderPassType || layer.sourceMetadata) && (
                <div className="pt-1 border-t border-border/50 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Source Metadata
                  </div>
                  {layer.blenderPassType && (
                    <div className="text-[10px] text-muted-foreground flex justify-between gap-2">
                      <span>Pass</span>
                      <span className="text-foreground">{BLENDER_PASS_LABELS[layer.blenderPassType]}</span>
                    </div>
                  )}
                  {layer.blenderGroupName && (
                    <div className="text-[10px] text-muted-foreground flex justify-between gap-2">
                      <span>Group</span>
                      <span className="text-foreground truncate">{layer.blenderGroupName}</span>
                    </div>
                  )}
                  {layer.blenderImportId && (
                    <div className="text-[10px] text-muted-foreground flex justify-between gap-2">
                      <span>Import</span>
                      <span className="text-foreground font-mono truncate">{layer.blenderImportId}</span>
                    </div>
                  )}
                  {layer.sourceMetadata && (
                    <>
                      {[
                        ...METADATA_ORDER.filter((key) => key in layer.sourceMetadata!),
                        ...Object.keys(layer.sourceMetadata).filter((key) => !METADATA_ORDER.includes(key)),
                      ].map((key) => (
                        <div key={key} className="text-[10px] text-muted-foreground flex justify-between gap-2">
                          <span className="capitalize">{key.replace(/_/g, " ")}</span>
                          <span className="text-foreground truncate">{String(layer.sourceMetadata?.[key])}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Mask controls */}
              <div className="pt-1 border-t border-border/50">
                {layerHasMask(layer) ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleMaskEdit(layer.id)}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded-md border transition-colors ${
                        editingMaskLayerId === layer.id
                          ? "bg-primary/15 border-primary/30 text-primary"
                          : "bg-secondary border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <PaintBucket className="w-3 h-3" />
                      {editingMaskLayerId === layer.id
                        ? "Editing Mask"
                        : "Edit Mask"}
                    </button>
                    <button
                      onClick={() => {
                        // Fill mask white (reveal all)
                        const canvas = document.createElement("canvas");
                        canvas.width = layer.width;
                        canvas.height = layer.height;
                        const ctx = canvas.getContext("2d")!;
                        ctx.fillStyle = "#ffffff";
                        ctx.fillRect(0, 0, layer.width, layer.height);
                        const mRef = generateImageRef();
                        globalImageCache.putSync(canvas.toDataURL("image/png"), mRef);
                        updateLayer(layer.id, {
                          maskRef: mRef,
                        });
                      }}
                      className="px-2 py-1.5 text-[10px] rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground"
                      title="Reset mask (reveal all)"
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => addMaskToLayer(layer.id)}
                    className="w-full flex items-center justify-center gap-1.5 py-1.5 text-[10px] rounded-md border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                  >
                    <CircleDot className="w-3 h-3" />
                    Add Mask
                  </button>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
}
