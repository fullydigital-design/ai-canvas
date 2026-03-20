import { create } from "zustand";
import { imageCache, generateImageRef } from "./image-cache";

export interface LevelsAdjustment {
  inputBlack: number;   // 0-255
  inputWhite: number;   // 0-255
  gamma: number;        // 0.1-10
  outputBlack: number;  // 0-255
  outputWhite: number;  // 0-255
}

export interface CurvePoint {
  x: number; // 0-255
  y: number; // 0-255
}

export interface CurvesAdjustment {
  rgb: CurvePoint[];
  red: CurvePoint[];
  green: CurvePoint[];
  blue: CurvePoint[];
}

export interface ColorBalanceAdjustment {
  shadowsCyanRed: number;       // -100 to 100
  shadowsMagentaGreen: number;
  shadowsYellowBlue: number;
  midtonesCyanRed: number;
  midtonesMagentaGreen: number;
  midtonesYellowBlue: number;
  highlightsCyanRed: number;
  highlightsMagentaGreen: number;
  highlightsYellowBlue: number;
}

export interface HueSaturationAdjustment {
  hue: number;        // -180 to 180
  saturation: number; // -100 to 100
  lightness: number;  // -100 to 100
}

export interface BlurSharpenAdjustment {
  blurRadius: number;     // 0-50
  sharpenAmount: number;  // 0-200
  sharpenRadius: number;  // 0.1-5
}

export interface LayerAdjustments {
  levels?: LevelsAdjustment;
  curves?: CurvesAdjustment;
  colorBalance?: ColorBalanceAdjustment;
  hueSaturation?: HueSaturationAdjustment;
  blurSharpen?: BlurSharpenAdjustment;
  filters?: FilterPreset[];
}

export type BlenderPassType =
  | "beauty"
  | "depth"
  | "normal"
  | "albedo"
  | "object_id"
  | "material_id"
  | "custom";

export type LayerSourceMetadata = Record<string, string | number | boolean | null>;

export interface FilterPreset {
  id: string;
  type: FilterType;
  enabled: boolean;
  intensity: number; // 0-100
}

export type FilterType =
  | "blur"
  | "sharpen"
  | "noise"
  | "vignette"
  | "grain"
  | "sepia"
  | "invert"
  | "posterize"
  | "emboss"
  | "pixelate"
  | "chromatic-aberration"
  | "glow";

export const DEFAULT_LEVELS: LevelsAdjustment = {
  inputBlack: 0, inputWhite: 255, gamma: 1.0, outputBlack: 0, outputWhite: 255,
};

export const DEFAULT_CURVES: CurvesAdjustment = {
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
};

export const DEFAULT_COLOR_BALANCE: ColorBalanceAdjustment = {
  shadowsCyanRed: 0, shadowsMagentaGreen: 0, shadowsYellowBlue: 0,
  midtonesCyanRed: 0, midtonesMagentaGreen: 0, midtonesYellowBlue: 0,
  highlightsCyanRed: 0, highlightsMagentaGreen: 0, highlightsYellowBlue: 0,
};

export const DEFAULT_HUE_SATURATION: HueSaturationAdjustment = {
  hue: 0, saturation: 0, lightness: 0,
};

export const DEFAULT_BLUR_SHARPEN: BlurSharpenAdjustment = {
  blurRadius: 0, sharpenAmount: 0, sharpenRadius: 1,
};

export interface Layer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  type: "image" | "fill" | "ai-generated" | "mask" | "text";
  /** Cache key into the global ImageCache (preferred). */
  imageRef?: string;
  /** @deprecated Legacy base64 data URL — use imageRef + ImageCache instead. */
  imageData?: string;
  blendMode: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cache key for mask data in ImageCache. */
  maskRef?: string;
  /** @deprecated Legacy base64 mask — use maskRef + ImageCache instead. */
  maskData?: string;
  maskEnabled?: boolean;
  fillColor?: string; // hex color for fill layers (default: #ffffff)
  adjustments?: LayerAdjustments;
  // Text layer properties
  textContent?: string;
  textFont?: string;
  textSize?: number;
  textColor?: string;
  textAlign?: "left" | "center" | "right";
  textBold?: boolean;
  textItalic?: boolean;
  textLineHeight?: number;
  blenderImportId?: string;
  blenderGroupId?: string;
  blenderGroupName?: string;
  blenderPassType?: BlenderPassType;
  sourceMetadata?: LayerSourceMetadata;
}

/**
 * Resolve a layer's image data URL. Prefers imageRef (cache) over legacy imageData.
 */
export function getLayerImageDataUrl(layer: Layer): string | undefined {
  if (layer.imageRef) return imageCache.getDataUrl(layer.imageRef);
  return layer.imageData;
}

/**
 * Resolve a layer's image element from cache. Works for both imageRef and legacy imageData.
 */
export function getLayerImageElement(layer: Layer): HTMLImageElement | undefined {
  if (layer.imageRef) return imageCache.getElement(layer.imageRef);
  return undefined; // legacy layers use per-component imageCache state
}

/**
 * Resolve a layer's mask data URL. Prefers maskRef (cache) over legacy maskData.
 */
export function getLayerMaskDataUrl(layer: Layer): string | undefined {
  if (layer.maskRef) return imageCache.getDataUrl(layer.maskRef);
  return layer.maskData;
}

/**
 * Check if a layer has image content (either via cache ref or legacy data).
 */
export function layerHasImage(layer: Layer): boolean {
  return !!(layer.imageRef || layer.imageData);
}

/**
 * Check if a layer has mask content (either via cache ref or legacy data).
 */
export function layerHasMask(layer: Layer): boolean {
  return !!(layer.maskRef || layer.maskData);
}

export interface SelectionPath {
  points: { x: number; y: number }[];
}

export interface Selection {
  x: number;
  y: number;
  width: number;
  height: number;
  path?: SelectionPath; // for lasso/magic-wand selections
}

export type Tool =
  | "select"
  | "move"
  | "rectangle-select"
  | "lasso"
  | "magic-wand"
  | "brush"
  | "eraser"
  | "clone-stamp"
  | "healing-brush"
  | "hand"
  | "zoom"
  | "transform"
  | "text"
  | "mask-brush"
  | "mask-eraser"
  | "eyedropper"
  | "gradient"
  | "crop";

export type GradientMode = "linear" | "radial";

export type CropAspectRatio = null | number; // null = free, number = w/h ratio

// ─── Undo/Redo Snapshot ─────────────────────────────────────────────
interface HistorySnapshot {
  layers: Layer[];
  activeLayerId: string | null;
}

const MAX_HISTORY = 50;

export interface EditorState {
  layers: Layer[];
  activeLayerId: string | null;
  activeTool: Tool;
  selection: Selection | null;
  canvasOffset: { x: number; y: number };
  canvasZoom: number;
  canvasWidth: number;
  canvasHeight: number;
  brushSize: number;
  brushColor: string;
  brushHardness: number;
  editingMaskLayerId: string | null;
  geminiApiKey: string;
  comfyuiUrl: string;
  generationPrompt: string;
  isGenerating: boolean;
  canUndo: boolean;
  canRedo: boolean;
  magicWandTolerance: number;
  magicWandContiguous: boolean;
  gradientEndColor: string;
  gradientMode: GradientMode;
  cropAspectRatio: CropAspectRatio;
  historyIndex: number;
  historyLength: number;
}

export interface EditorActions {
  setLayers: (layers: Layer[]) => void;
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  setActiveLayerId: (id: string | null) => void;
  setActiveTool: (tool: Tool) => void;
  setSelection: (sel: Selection | null) => void;
  setCanvasOffset: (offset: { x: number; y: number }) => void;
  setCanvasZoom: (zoom: number) => void;
  setCanvasSize: (width: number, height: number) => void;
  setCanvasDimensions: (width: number, height: number) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
  setBrushHardness: (hardness: number) => void;
  setEditingMaskLayerId: (id: string | null) => void;
  addMaskToLayer: (layerId: string) => void;
  removeMaskFromLayer: (layerId: string) => void;
  setGeminiApiKey: (key: string) => void;
  setComfyuiUrl: (url: string) => void;
  setGenerationPrompt: (prompt: string) => void;
  setIsGenerating: (val: boolean) => void;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;
  setMagicWandTolerance: (val: number) => void;
  setMagicWandContiguous: (val: boolean) => void;
  setGradientEndColor: (color: string) => void;
  setGradientMode: (mode: GradientMode) => void;
  setCropAspectRatio: (ratio: CropAspectRatio) => void;
  jumpToHistory: (index: number) => void;
  /** Update a layer WITHOUT pushing to undo history (for continuous drag operations) */
  updateLayerSilent: (id: string, updates: Partial<Layer>) => void;
  /** Set layers WITHOUT pushing to undo history (for project load, etc.) */
  setLayersSilent: (layers: Layer[]) => void;
  /** Store image data in cache, set layer.imageRef (pushes history). */
  updateLayerImage: (layerId: string, dataUrl: string) => void;
  /** Store mask data in cache, set layer.maskRef (pushes history). */
  updateLayerMask: (layerId: string, dataUrl: string) => void;
}

const INITIAL_BG: Layer = {
  id: "bg-1",
  name: "Background",
  visible: true,
  locked: false,
  opacity: 100,
  type: "fill",
  blendMode: "normal",
  x: 0,
  y: 0,
  width: 1024,
  height: 1024,
  fillColor: "#ffffff",
};

// ─── Undo/Redo History (module-level, outside store to avoid serialization) ──
let _history: HistorySnapshot[] = [
  { layers: [INITIAL_BG], activeLayerId: "bg-1" },
];
let _historyIndex = 0;

/** Collect all imageRef/maskRef keys referenced by current state + history. */
function _collectActiveRefs(currentLayers: Layer[]): Set<string> {
  const refs = new Set<string>();
  const addLayerRefs = (l: Layer) => {
    if (l.imageRef) refs.add(l.imageRef);
    if (l.maskRef) refs.add(l.maskRef);
  };
  currentLayers.forEach(addLayerRefs);
  _history.forEach((snap) => snap.layers.forEach(addLayerRefs));
  return refs;
}

/** Prune cache entries not referenced by any history snapshot or current state. */
function _gcImageCache(currentLayers: Layer[]) {
  const active = _collectActiveRefs(currentLayers);
  imageCache.gc(active);
}

function _updateUndoRedoFlags(set: (partial: Partial<EditorState>) => void) {
  set({
    canUndo: _historyIndex > 0,
    canRedo: _historyIndex < _history.length - 1,
    historyIndex: _historyIndex,
    historyLength: _history.length,
  });
}

// ─── Zustand Store ───────────────────────────────────────────────────────────
export const useEditorStore = create<EditorState & EditorActions>()((set, get) => ({
  // ── State ──────────────────────────────────────────────────
  layers: [INITIAL_BG],
  activeLayerId: "bg-1",
  activeTool: "move",
  selection: null,
  canvasOffset: { x: 0, y: 0 },
  canvasZoom: 1,
  canvasWidth: 1024,
  canvasHeight: 1024,
  brushSize: 30,
  brushColor: "#3ECF8E",
  brushHardness: 80,
  editingMaskLayerId: null,
  geminiApiKey: "",
  comfyuiUrl: "http://localhost:8188",
  generationPrompt: "",
  isGenerating: false,
  canUndo: false,
  canRedo: false,
  magicWandTolerance: 30,
  magicWandContiguous: true,
  gradientEndColor: "#000000",
  gradientMode: "linear",
  cropAspectRatio: null,
  historyIndex: 0,
  historyLength: 1,

  // ── Actions ────────────────────────────────────────────────

  pushHistory: () => {
    const { layers, activeLayerId } = get();
    const snapshot: HistorySnapshot = {
      layers: layers.map((l) => ({ ...l })),
      activeLayerId,
    };
    _history.splice(_historyIndex + 1);
    _history.push(snapshot);
    if (_history.length > MAX_HISTORY) {
      _history.shift();
      // GC image cache after discarding old history entries
      _gcImageCache(layers);
    } else {
      _historyIndex++;
    }
    _updateUndoRedoFlags(set);
  },

  undo: () => {
    if (_historyIndex <= 0) return;
    const { layers, activeLayerId } = get();
    // If at the tip, save current state so we can redo back to it
    if (_historyIndex === _history.length - 1) {
      _history.push({
        layers: layers.map((l) => ({ ...l })),
        activeLayerId,
      });
      if (_history.length > MAX_HISTORY + 1) _history.shift();
    }
    _historyIndex--;
    const snapshot = _history[_historyIndex];
    set({
      layers: snapshot.layers.map((l) => ({ ...l })),
      activeLayerId: snapshot.activeLayerId,
    });
    _updateUndoRedoFlags(set);
  },

  redo: () => {
    if (_historyIndex >= _history.length - 1) return;
    _historyIndex++;
    const snapshot = _history[_historyIndex];
    set({
      layers: snapshot.layers.map((l) => ({ ...l })),
      activeLayerId: snapshot.activeLayerId,
    });
    _updateUndoRedoFlags(set);
  },

  jumpToHistory: (index: number) => {
    if (index < 0 || index >= _history.length) return;
    _historyIndex = index;
    const snapshot = _history[_historyIndex];
    set({
      layers: snapshot.layers.map((l) => ({ ...l })),
      activeLayerId: snapshot.activeLayerId,
    });
    _updateUndoRedoFlags(set);
  },

  setLayers: (newLayers: Layer[]) => {
    get().pushHistory();
    set({ layers: newLayers });
  },

  setLayersSilent: (layers: Layer[]) => {
    set({ layers });
  },

  setActiveLayerId: (id: string | null) => {
    set({ activeLayerId: id });
  },

  addLayer: (layer: Layer) => {
    get().pushHistory();
    set((s) => ({ layers: [layer, ...s.layers], activeLayerId: layer.id }));
  },

  removeLayer: (id: string) => {
    get().pushHistory();
    set((s) => ({
      layers: s.layers.filter((l) => l.id !== id),
      activeLayerId: s.activeLayerId === id ? null : s.activeLayerId,
    }));
  },

  updateLayer: (id: string, updates: Partial<Layer>) => {
    get().pushHistory();
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  },

  updateLayerSilent: (id: string, updates: Partial<Layer>) => {
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  },

  updateLayerImage: (layerId: string, dataUrl: string) => {
    const ref = generateImageRef();
    imageCache.putSync(dataUrl, ref);
    get().pushHistory();
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === layerId
          ? { ...l, imageRef: ref, imageData: undefined, type: "image" as const }
          : l
      ),
    }));
  },

  updateLayerMask: (layerId: string, dataUrl: string) => {
    const ref = generateImageRef();
    imageCache.putSync(dataUrl, ref);
    get().pushHistory();
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === layerId
          ? { ...l, maskRef: ref, maskData: undefined }
          : l
      ),
    }));
  },

  reorderLayers: (fromIndex: number, toIndex: number) => {
    get().pushHistory();
    set((s) => {
      const next = [...s.layers];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { layers: next };
    });
  },

  setActiveTool: (tool: Tool) => set({ activeTool: tool }),
  setSelection: (sel: Selection | null) => set({ selection: sel }),
  setCanvasOffset: (offset: { x: number; y: number }) => set({ canvasOffset: offset }),
  setCanvasZoom: (zoom: number) => set({ canvasZoom: zoom }),
  setBrushSize: (size: number) => set({ brushSize: size }),
  setBrushColor: (color: string) => set({ brushColor: color }),
  setBrushHardness: (hardness: number) => set({ brushHardness: hardness }),
  setEditingMaskLayerId: (id: string | null) => set({ editingMaskLayerId: id }),
  setGeminiApiKey: (key: string) => set({ geminiApiKey: key }),
  setComfyuiUrl: (url: string) => set({ comfyuiUrl: url }),
  setGenerationPrompt: (prompt: string) => set({ generationPrompt: prompt }),
  setIsGenerating: (val: boolean) => set({ isGenerating: val }),
  setMagicWandTolerance: (val: number) => set({ magicWandTolerance: val }),
  setMagicWandContiguous: (val: boolean) => set({ magicWandContiguous: val }),
  setGradientEndColor: (color: string) => set({ gradientEndColor: color }),
  setGradientMode: (mode: GradientMode) => set({ gradientMode: mode }),
  setCropAspectRatio: (ratio: CropAspectRatio) => set({ cropAspectRatio: ratio }),

  setCanvasSize: (width: number, height: number) => {
    get().pushHistory();
    set((s) => ({
      canvasWidth: width,
      canvasHeight: height,
      layers: s.layers.map((l) =>
        l.id === "bg-1" ? { ...l, width, height } : l
      ),
    }));
  },

  setCanvasDimensions: (width: number, height: number) => {
    set({ canvasWidth: width, canvasHeight: height });
  },

  addMaskToLayer: (layerId: string) => {
    get().pushHistory();
    set((s) => ({
      layers: s.layers.map((l) => {
        if (l.id !== layerId) return l;
        const canvas = document.createElement("canvas");
        canvas.width = l.width;
        canvas.height = l.height;
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, l.width, l.height);
        return {
          ...l,
          maskData: canvas.toDataURL("image/png"),
          maskEnabled: true,
        };
      }),
      editingMaskLayerId: layerId,
    }));
  },

  removeMaskFromLayer: (layerId: string) => {
    get().pushHistory();
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === layerId
          ? { ...l, maskData: undefined, maskEnabled: undefined }
          : l
      ),
      editingMaskLayerId: s.editingMaskLayerId === layerId ? null : s.editingMaskLayerId,
    }));
  },
}));

export type EditorStore = EditorState & EditorActions;

/**
 * Selector-based hook for Zustand subscriptions.
 * Use this in performance-sensitive components to avoid full-store re-renders.
 */
export function useEditorSelector<T>(selector: (state: EditorStore) => T): T {
  return useEditorStore(selector);
}

/**
 * Convenience hook — returns the full store (state + actions).
 * Drop-in replacement for the old Context-based useEditor().
 */
export const useEditor = useEditorStore;

