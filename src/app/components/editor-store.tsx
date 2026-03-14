import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from "react";

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
  imageData?: string; // base64 data URL
  blendMode: string;
  x: number;
  y: number;
  width: number;
  height: number;
  maskData?: string; // base64 mask (white=show, black=hide)
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

interface EditorState {
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

interface EditorActions {
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
}

const noop = (() => {}) as any;

const defaultState: EditorState & EditorActions = {
  layers: [],
  activeLayerId: null,
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
  setLayers: noop,
  addLayer: noop,
  removeLayer: noop,
  updateLayer: noop,
  reorderLayers: noop,
  setActiveLayerId: noop,
  setActiveTool: noop,
  setSelection: noop,
  setCanvasOffset: noop,
  setCanvasZoom: noop,
  setCanvasSize: noop,
  setCanvasDimensions: noop,
  setBrushSize: noop,
  setBrushColor: noop,
  setBrushHardness: noop,
  setEditingMaskLayerId: noop,
  addMaskToLayer: noop,
  removeMaskFromLayer: noop,
  setGeminiApiKey: noop,
  setComfyuiUrl: noop,
  setGenerationPrompt: noop,
  setIsGenerating: noop,
  undo: noop,
  redo: noop,
  pushHistory: noop,
  setMagicWandTolerance: noop,
  setMagicWandContiguous: noop,
  setGradientEndColor: noop,
  setGradientMode: noop,
  setCropAspectRatio: noop,
  jumpToHistory: noop,
  updateLayerSilent: noop,
  setLayersSilent: noop,
};

const EditorContext = createContext<EditorState & EditorActions>(defaultState);

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

export function EditorProvider({ children }: { children: ReactNode }) {
  const [layers, setLayersRaw] = useState<Layer[]>([INITIAL_BG]);
  const [activeLayerId, setActiveLayerIdRaw] = useState<string | null>("bg-1");
  const [activeTool, setActiveTool] = useState<Tool>("move");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasWidth, setCanvasWidth] = useState(1024);
  const [canvasHeight, setCanvasHeight] = useState(1024);
  const [brushSize, setBrushSize] = useState(30);
  const [brushColor, setBrushColor] = useState("#3ECF8E");
  const [brushHardness, setBrushHardness] = useState(80);
  const [editingMaskLayerId, setEditingMaskLayerId] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [comfyuiUrl, setComfyuiUrl] = useState("http://localhost:8188");
  const [generationPrompt, setGenerationPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [magicWandTolerance, setMagicWandTolerance] = useState(30);
  const [magicWandContiguous, setMagicWandContiguous] = useState(true);
  const [gradientEndColor, setGradientEndColor] = useState("#000000");
  const [gradientMode, setGradientMode] = useState<GradientMode>("linear");
  const [cropAspectRatio, setCropAspectRatio] = useState<CropAspectRatio>(null);

  // ─── Undo/Redo History ────────────────────────────────────────
  const historyRef = useRef<HistorySnapshot[]>([
    { layers: [INITIAL_BG], activeLayerId: "bg-1" },
  ]);
  const historyIndexRef = useRef(0);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateUndoRedoState = useCallback(() => {
    setCanUndo(historyIndexRef.current > 0);
    setCanRedo(historyIndexRef.current < historyRef.current.length - 1);
  }, []);

  // Push current state to history (called BEFORE making a change)
  const pushHistory = useCallback(() => {
    setLayersRaw((currentLayers) => {
      setActiveLayerIdRaw((currentActiveId) => {
        const snapshot: HistorySnapshot = {
          layers: currentLayers.map((l) => ({ ...l })),
          activeLayerId: currentActiveId,
        };
        // Truncate any future history beyond current index
        const history = historyRef.current;
        history.splice(historyIndexRef.current + 1);
        history.push(snapshot);
        // Cap size
        if (history.length > MAX_HISTORY) {
          history.shift();
        } else {
          historyIndexRef.current++;
        }
        updateUndoRedoState();
        return currentActiveId;
      });
      return currentLayers;
    });
  }, [updateUndoRedoState]);

  const undo = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    // Save current state as future
    setLayersRaw((currentLayers) => {
      setActiveLayerIdRaw((currentActiveId) => {
        const history = historyRef.current;
        // If we're at the tip, push current state so we can redo back to it
        if (historyIndexRef.current === history.length - 1) {
          history.push({
            layers: currentLayers.map((l) => ({ ...l })),
            activeLayerId: currentActiveId,
          });
          if (history.length > MAX_HISTORY + 1) history.shift();
        }
        historyIndexRef.current--;
        const snapshot = history[historyIndexRef.current];
        // Defer actual state update
        setTimeout(() => {
          setLayersRaw(snapshot.layers.map((l) => ({ ...l })));
          setActiveLayerIdRaw(snapshot.activeLayerId);
          updateUndoRedoState();
        }, 0);
        return currentActiveId;
      });
      return currentLayers;
    });
  }, [updateUndoRedoState]);

  const redo = useCallback(() => {
    const history = historyRef.current;
    if (historyIndexRef.current >= history.length - 1) return;
    historyIndexRef.current++;
    const snapshot = history[historyIndexRef.current];
    setLayersRaw(snapshot.layers.map((l) => ({ ...l })));
    setActiveLayerIdRaw(snapshot.activeLayerId);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  const jumpToHistory = useCallback((index: number) => {
    const history = historyRef.current;
    if (index < 0 || index >= history.length) return;
    historyIndexRef.current = index;
    const snapshot = history[historyIndexRef.current];
    setLayersRaw(snapshot.layers.map((l) => ({ ...l })));
    setActiveLayerIdRaw(snapshot.activeLayerId);
    updateUndoRedoState();
  }, [updateUndoRedoState]);

  // Wrapped setters that auto-push history for layer-modifying ops
  const setLayers = useCallback((newLayers: Layer[]) => {
    pushHistory();
    setLayersRaw(newLayers);
  }, [pushHistory]);

  const setActiveLayerId = useCallback((id: string | null) => {
    setActiveLayerIdRaw(id);
  }, []);

  const addLayer = useCallback((layer: Layer) => {
    pushHistory();
    setLayersRaw((prev) => [layer, ...prev]);
    setActiveLayerIdRaw(layer.id);
  }, [pushHistory]);

  const removeLayer = useCallback(
    (id: string) => {
      pushHistory();
      setLayersRaw((prev) => prev.filter((l) => l.id !== id));
      setActiveLayerIdRaw((prev) => (prev === id ? null : prev));
    },
    [pushHistory]
  );

  const updateLayer = useCallback((id: string, updates: Partial<Layer>) => {
    pushHistory();
    setLayersRaw((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
    );
  }, [pushHistory]);

  const reorderLayers = useCallback((fromIndex: number, toIndex: number) => {
    pushHistory();
    setLayersRaw((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, [pushHistory]);

  const setCanvasSize = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
    pushHistory();
    setLayersRaw((prev) =>
      prev.map((l) =>
        l.id === "bg-1" ? { ...l, width, height } : l
      )
    );
  }, [pushHistory]);

  // Lightweight canvas dimension setter — no history push, no layer updates
  const setCanvasDimensions = useCallback((width: number, height: number) => {
    setCanvasWidth(width);
    setCanvasHeight(height);
  }, []);

  const addMaskToLayer = useCallback((layerId: string) => {
    pushHistory();
    setLayersRaw((prev) => {
      return prev.map((l) => {
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
      });
    });
    setEditingMaskLayerId(layerId);
  }, [pushHistory]);

  const removeMaskFromLayer = useCallback((layerId: string) => {
    pushHistory();
    setLayersRaw((prev) =>
      prev.map((l) =>
        l.id === layerId
          ? { ...l, maskData: undefined, maskEnabled: undefined }
          : l
      )
    );
    setEditingMaskLayerId((prev) => (prev === layerId ? null : prev));
  }, [pushHistory]);

  return (
    <EditorContext.Provider
      value={{
        layers,
        activeLayerId,
        activeTool,
        selection,
        canvasOffset,
        canvasZoom,
        canvasWidth,
        canvasHeight,
        brushSize,
        brushColor,
        brushHardness,
        editingMaskLayerId,
        geminiApiKey,
        comfyuiUrl,
        generationPrompt,
        isGenerating,
        canUndo,
        canRedo,
        magicWandTolerance,
        magicWandContiguous,
        gradientEndColor,
        gradientMode,
        cropAspectRatio,
        historyIndex: historyIndexRef.current,
        historyLength: historyRef.current.length,
        setLayers,
        addLayer,
        removeLayer,
        updateLayer,
        reorderLayers,
        setActiveLayerId,
        setActiveTool,
        setSelection,
        setCanvasOffset,
        setCanvasZoom,
        setCanvasSize,
        setCanvasDimensions,
        setBrushSize,
        setBrushColor,
        setBrushHardness,
        setEditingMaskLayerId,
        addMaskToLayer,
        removeMaskFromLayer,
        setGeminiApiKey,
        setComfyuiUrl,
        setGenerationPrompt,
        setIsGenerating,
        undo,
        redo,
        pushHistory,
        setMagicWandTolerance,
        setMagicWandContiguous,
        setGradientEndColor,
        setGradientMode,
        setCropAspectRatio,
        jumpToHistory,
        updateLayerSilent: (id: string, updates: Partial<Layer>) => {
          setLayersRaw((prev) =>
            prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
          );
        },
        setLayersSilent: (layers: Layer[]) => {
          setLayersRaw(layers);
        },
      }}
    >
      {children}
    </EditorContext.Provider>
  );
}

export function useEditor() {
  const ctx = useContext(EditorContext);
  return ctx;
}