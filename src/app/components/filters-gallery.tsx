/**
 * Filters Gallery — non-destructive filter presets applied per-layer.
 * Sharpen, Blur, Noise, Vignette, Grain, Sepia, Invert, Posterize,
 * Emboss, Pixelate, Chromatic Aberration, Glow.
 */
import { useState } from "react";
import {
  X,
  Plus,
  Eye,
  EyeOff,
  Trash2,
  SlidersHorizontal,
  Sparkles,
  Droplets,
  Sun,
  Palette,
  Grid3x3,
  Zap,
  CircleDot,
  Layers,
} from "lucide-react";
import { useEditorSelector, type FilterPreset, type FilterType, type LayerAdjustments } from "./editor-store";
import { useShallow } from "zustand/react/shallow";

const FILTER_CATALOG: {
  type: FilterType;
  name: string;
  icon: React.ElementType;
  description: string;
  defaultIntensity: number;
}[] = [
  { type: "blur", name: "Gaussian Blur", icon: Droplets, description: "Smooth/soften image", defaultIntensity: 30 },
  { type: "sharpen", name: "Sharpen", icon: Zap, description: "Enhance edges and detail", defaultIntensity: 50 },
  { type: "noise", name: "Add Noise", icon: Grid3x3, description: "Film-like noise grain", defaultIntensity: 25 },
  { type: "vignette", name: "Vignette", icon: CircleDot, description: "Dark edges, light center", defaultIntensity: 40 },
  { type: "grain", name: "Film Grain", icon: Sparkles, description: "Organic film grain texture", defaultIntensity: 30 },
  { type: "sepia", name: "Sepia Tone", icon: Palette, description: "Warm vintage color tone", defaultIntensity: 70 },
  { type: "invert", name: "Invert Colors", icon: Layers, description: "Negative/inverted colors", defaultIntensity: 100 },
  { type: "posterize", name: "Posterize", icon: SlidersHorizontal, description: "Reduce color levels", defaultIntensity: 50 },
  { type: "emboss", name: "Emboss", icon: Sun, description: "3D relief emboss effect", defaultIntensity: 50 },
  { type: "pixelate", name: "Pixelate", icon: Grid3x3, description: "Mosaic pixel blocks", defaultIntensity: 30 },
  { type: "chromatic-aberration", name: "Chromatic Aberration", icon: Palette, description: "RGB color fringing", defaultIntensity: 40 },
  { type: "glow", name: "Glow", icon: Sun, description: "Soft light bloom", defaultIntensity: 35 },
];

interface FiltersGalleryProps {
  open: boolean;
  onClose: () => void;
}

export function FiltersGallery({ open, onClose }: FiltersGalleryProps) {
  const { layers, activeLayerId, updateLayer, updateLayerSilent, pushHistory } = useEditorSelector(
    useShallow((s) => ({
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      updateLayer: s.updateLayer,
      updateLayerSilent: s.updateLayerSilent,
      pushHistory: s.pushHistory,
    }))
  );
  const [view, setView] = useState<"gallery" | "active">("gallery");
  const [backdropMode, setBackdropMode] = useState<"focus" | "preview" | "clear">("preview");

  const activeLayer = layers.find((l) => l.id === activeLayerId);
  const activeFilters = activeLayer?.adjustments?.filters || [];

  const addFilter = (type: FilterType) => {
    if (!activeLayerId || !activeLayer) return;
    const catalog = FILTER_CATALOG.find((f) => f.type === type)!;
    const newFilter: FilterPreset = {
      id: `filter-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      type,
      enabled: true,
      intensity: catalog.defaultIntensity,
    };
    const currentAdj = activeLayer.adjustments || {};
    const currentFilters = currentAdj.filters || [];
    updateLayer(activeLayerId, {
      adjustments: {
        ...currentAdj,
        filters: [...currentFilters, newFilter],
      },
    });
    setView("active");
  };

  const updateFilter = (filterId: string, updates: Partial<FilterPreset>) => {
    if (!activeLayerId || !activeLayer) return;
    const adj = activeLayer.adjustments || {};
    const filters = (adj.filters || []).map((f) =>
      f.id === filterId ? { ...f, ...updates } : f
    );
    updateLayer(activeLayerId, { adjustments: { ...adj, filters } });
  };

  // Silent version for continuous slider drags (no history push)
  const updateFilterSilent = (filterId: string, updates: Partial<FilterPreset>) => {
    if (!activeLayerId || !activeLayer) return;
    const adj = activeLayer.adjustments || {};
    const filters = (adj.filters || []).map((f) =>
      f.id === filterId ? { ...f, ...updates } : f
    );
    updateLayerSilent(activeLayerId, { adjustments: { ...adj, filters } });
  };

  const removeFilter = (filterId: string) => {
    if (!activeLayerId || !activeLayer) return;
    const adj = activeLayer.adjustments || {};
    const filters = (adj.filters || []).filter((f) => f.id !== filterId);
    updateLayer(activeLayerId, { adjustments: { ...adj, filters } });
  };

  const clearAllFilters = () => {
    if (!activeLayerId || !activeLayer) return;
    const adj = activeLayer.adjustments || {};
    updateLayer(activeLayerId, { adjustments: { ...adj, filters: [] } });
  };

  if (!open) return null;

  const backdropClass =
    backdropMode === "focus"
      ? "bg-black/55 backdrop-blur-sm"
      : backdropMode === "preview"
      ? "bg-black/22"
      : "bg-black/8";

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center ${backdropClass}`}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-[640px] max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-foreground">Filters Gallery</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Background visibility */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setBackdropMode("focus")}
                className={`px-2.5 py-1 text-[10px] transition-colors ${
                  backdropMode === "focus"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                title="Focus mode (darker + blur)"
              >
                Focus
              </button>
              <button
                onClick={() => setBackdropMode("preview")}
                className={`px-2.5 py-1 text-[10px] transition-colors ${
                  backdropMode === "preview"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                title="Preview mode (lighter dim)"
              >
                Preview
              </button>
              <button
                onClick={() => setBackdropMode("clear")}
                className={`px-2.5 py-1 text-[10px] transition-colors ${
                  backdropMode === "clear"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
                title="Clear mode (minimal dim)"
              >
                Clear
              </button>
            </div>
            {/* View tabs */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setView("gallery")}
                className={`px-3 py-1 text-xs transition-colors ${
                  view === "gallery"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Gallery
              </button>
              <button
                onClick={() => setView("active")}
                className={`px-3 py-1 text-xs transition-colors ${
                  view === "active"
                    ? "bg-primary/15 text-primary"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                Active ({activeFilters.length})
              </button>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!activeLayerId && (
          <div className="flex-1 flex items-center justify-center p-8 text-muted-foreground text-sm">
            Select a layer to apply filters
          </div>
        )}

        {activeLayerId && view === "gallery" && (
          <div className="flex-1 overflow-y-auto p-4">
            <div className="grid grid-cols-3 gap-2">
              {FILTER_CATALOG.map((filter) => {
                const Icon = filter.icon;
                const isApplied = activeFilters.some((f) => f.type === filter.type && f.enabled);
                return (
                  <button
                    key={filter.type}
                    onClick={() => addFilter(filter.type)}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                      isApplied
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:border-primary/20 hover:bg-accent/30"
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isApplied ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                    }`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-foreground">{filter.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">{filter.description}</div>
                    </div>
                    {isApplied && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/20">
                        Applied
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeLayerId && view === "active" && (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {activeFilters.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No filters applied. Go to Gallery to add one.
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-muted-foreground">
                    {activeFilters.length} filter(s) on "{activeLayer?.name}"
                  </span>
                  <button
                    onClick={clearAllFilters}
                    className="text-[10px] text-destructive hover:underline"
                  >
                    Clear All
                  </button>
                </div>
                {activeFilters.map((filter) => {
                  const catalog = FILTER_CATALOG.find((f) => f.type === filter.type);
                  if (!catalog) return null;
                  const Icon = catalog.icon;
                  return (
                    <div
                      key={filter.id}
                      className={`border rounded-lg p-3 transition-colors ${
                        filter.enabled
                          ? "border-border bg-secondary/30"
                          : "border-border/50 bg-secondary/10 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <Icon className="w-3.5 h-3.5 text-primary shrink-0" />
                        <span className="text-xs text-foreground flex-1">{catalog.name}</span>
                        <button
                          onClick={() => updateFilter(filter.id, { enabled: !filter.enabled })}
                          className="p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                          title={filter.enabled ? "Disable" : "Enable"}
                        >
                          {filter.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => removeFilter(filter.id)}
                          className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground w-14">Intensity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={filter.intensity}
                          onChange={(e) =>
                            updateFilterSilent(filter.id, { intensity: Number(e.target.value) })
                          }
                          onPointerUp={() => pushHistory()}
                          className="flex-1 accent-primary h-1"
                        />
                        <span className="text-[10px] text-muted-foreground w-8 text-right">
                          {filter.intensity}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-4 py-2 flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            Filters are non-destructive and applied in order
          </span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Filter Application Utilities (pixel-level) ──────────────────────

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v) | 0;

export function applyFilters(data: Uint8ClampedArray, width: number, height: number, filters: FilterPreset[]) {
  // Create a temporary ImageData-like wrapper
  const imageData = { data, width, height } as ImageData;
  for (const filter of filters) {
    if (!filter.enabled || filter.intensity <= 0) continue;
    const t = filter.intensity / 100;
    switch (filter.type) {
      case "blur":
        applyBoxBlur(imageData, Math.round(t * 20));
        break;
      case "sharpen":
        applySharpen(imageData, t * 2);
        break;
      case "noise":
        applyNoise(imageData, t * 80);
        break;
      case "vignette":
        applyVignette(imageData, t);
        break;
      case "grain":
        applyGrain(imageData, t * 60);
        break;
      case "sepia":
        applySepia(imageData, t);
        break;
      case "invert":
        applyInvert(imageData, t);
        break;
      case "posterize":
        applyPosterize(imageData, Math.max(2, Math.round(2 + (1 - t) * 14)));
        break;
      case "emboss":
        applyEmboss(imageData, t);
        break;
      case "pixelate":
        applyPixelate(imageData, Math.max(1, Math.round(t * 30)));
        break;
      case "chromatic-aberration":
        applyChromaticAberration(imageData, Math.round(t * 10));
        break;
      case "glow":
        applyGlow(imageData, t);
        break;
    }
  }
}

function applyBoxBlur(data: ImageData, radius: number) {
  if (radius < 1) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  const size = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const i = (ny * w + nx) * 4;
            r += copy[i]; g += copy[i + 1]; b += copy[i + 2];
            count++;
          }
        }
      }
      const i = (y * w + x) * 4;
      d[i] = r / count; d[i + 1] = g / count; d[i + 2] = b / count;
    }
  }
}

function applySharpen(data: ImageData, amount: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const center = copy[i + c] * (1 + 4 * amount);
        const neighbors =
          (copy[((y - 1) * w + x) * 4 + c] +
            copy[((y + 1) * w + x) * 4 + c] +
            copy[(y * w + x - 1) * 4 + c] +
            copy[(y * w + x + 1) * 4 + c]) * amount;
        d[i + c] = clamp(center - neighbors);
      }
    }
  }
}

function applyNoise(data: ImageData, amount: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const noise = (Math.random() - 0.5) * amount;
    d[i] = clamp(d[i] + noise);
    d[i + 1] = clamp(d[i + 1] + noise);
    d[i + 2] = clamp(d[i + 2] + noise);
  }
}

function applyVignette(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const cx = w / 2;
  const cy = h / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const factor = 1 - (dist / maxDist) * strength;
      const clamped = Math.max(0, factor);
      const i = (y * w + x) * 4;
      d[i] = clamp(d[i] * clamped);
      d[i + 1] = clamp(d[i + 1] * clamped);
      d[i + 2] = clamp(d[i + 2] * clamped);
    }
  }
}

function applyGrain(data: ImageData, amount: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const grain = (Math.random() - 0.5) * amount;
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const grainAmount = grain * (1 - Math.abs(lum - 0.5) * 2);
    d[i] = clamp(d[i] + grainAmount);
    d[i + 1] = clamp(d[i + 1] + grainAmount);
    d[i + 2] = clamp(d[i + 2] + grainAmount);
  }
}

function applySepia(data: ImageData, t: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const sr = clamp(r * 0.393 + g * 0.769 + b * 0.189);
    const sg = clamp(r * 0.349 + g * 0.686 + b * 0.168);
    const sb = clamp(r * 0.272 + g * 0.534 + b * 0.131);
    d[i] = clamp(r + (sr - r) * t);
    d[i + 1] = clamp(g + (sg - g) * t);
    d[i + 2] = clamp(b + (sb - b) * t);
  }
}

function applyInvert(data: ImageData, t: number) {
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + (255 - 2 * d[i]) * t);
    d[i + 1] = clamp(d[i + 1] + (255 - 2 * d[i + 1]) * t);
    d[i + 2] = clamp(d[i + 2] + (255 - 2 * d[i + 2]) * t);
  }
}

function applyPosterize(data: ImageData, levels: number) {
  const d = data.data;
  const step = 255 / (levels - 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(Math.round(d[i] / step) * step);
    d[i + 1] = clamp(Math.round(d[i + 1] / step) * step);
    d[i + 2] = clamp(Math.round(d[i + 2] / step) * step);
  }
}

function applyEmboss(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        const tl = copy[((y - 1) * w + x - 1) * 4 + c];
        const br = copy[((y + 1) * w + x + 1) * 4 + c];
        const embossed = clamp(128 + (br - tl) * strength * 2);
        d[i + c] = clamp(d[i + c] * (1 - strength) + embossed * strength);
      }
    }
  }
}

function applyPixelate(data: ImageData, blockSize: number) {
  if (blockSize < 2) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  for (let y = 0; y < h; y += blockSize) {
    for (let x = 0; x < w; x += blockSize) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const i = ((y + dy) * w + x + dx) * 4;
          r += d[i]; g += d[i + 1]; b += d[i + 2]; count++;
        }
      }
      r = r / count; g = g / count; b = b / count;
      for (let dy = 0; dy < blockSize && y + dy < h; dy++) {
        for (let dx = 0; dx < blockSize && x + dx < w; dx++) {
          const i = ((y + dy) * w + x + dx) * 4;
          d[i] = r; d[i + 1] = g; d[i + 2] = b;
        }
      }
    }
  }
}

function applyChromaticAberration(data: ImageData, offset: number) {
  if (offset < 1) return;
  const w = data.width;
  const h = data.height;
  const d = data.data;
  const copy = new Uint8ClampedArray(d);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      // Shift red channel left, blue channel right
      const rxSrc = Math.min(w - 1, Math.max(0, x - offset));
      const bxSrc = Math.min(w - 1, Math.max(0, x + offset));
      d[i] = copy[(y * w + rxSrc) * 4];         // Red from left
      d[i + 2] = copy[(y * w + bxSrc) * 4 + 2]; // Blue from right
    }
  }
}

function applyGlow(data: ImageData, strength: number) {
  const w = data.width;
  const h = data.height;
  const d = data.data;
  // Create a blurred copy and add it as a light overlay
  const copy = new Uint8ClampedArray(d);
  const radius = Math.max(2, Math.round(strength * 8));
  // Simple horizontal + vertical box blur
  const temp = new Uint8ClampedArray(d.length);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < w) {
          const si = (y * w + nx) * 4;
          r += copy[si]; g += copy[si + 1]; b += copy[si + 2]; count++;
        }
      }
      const i = (y * w + x) * 4;
      temp[i] = r / count; temp[i + 1] = g / count; temp[i + 2] = b / count; temp[i + 3] = 255;
    }
  }
  // Vertical pass  
  const blurred = new Uint8ClampedArray(d.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < h) {
          const si = (ny * w + x) * 4;
          r += temp[si]; g += temp[si + 1]; b += temp[si + 2]; count++;
        }
      }
      const i = (y * w + x) * 4;
      blurred[i] = r / count; blurred[i + 1] = g / count; blurred[i + 2] = b / count;
    }
  }
  // Screen blend: result = 1 - (1-a)(1-b)
  const s = strength * 0.6;
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const a = d[i + c] / 255;
      const b2 = blurred[i + c] / 255;
      const screen = 1 - (1 - a) * (1 - b2 * s);
      d[i + c] = clamp(screen * 255);
    }
  }
}
