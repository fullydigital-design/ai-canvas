import { ThemeProvider } from "./components/theme-provider";
import {
  useEditorSelector,
  useEditorStore,
  type Layer,
  type BlenderPassType,
  type LayerSourceMetadata,
} from "./components/editor-store";
import { HeaderBar } from "./components/header-bar";
import { Toolbar } from "./components/toolbar";
import { InfiniteCanvas } from "./components/infinite-canvas";
import { useKeyboardShortcuts } from "./components/keyboard-shortcuts";
import { useElectronMenu } from "./components/use-electron-menu";
import { useState, useEffect, useCallback, Suspense, lazy } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ProjectFile } from "./components/project-io";
import { StatusBar } from "./components/status-bar";
import { clearAutoSavedProject, getAutoSavedProject, useAutoSave } from "./components/auto-save";
import { isBlender3DTabEnabled } from "./components/feature-flags";
import { imageCache as globalImageCache, generateImageRef } from "./components/image-cache";

const BLENDER_PASS_ORDER: BlenderPassType[] = [
  "beauty",
  "albedo",
  "normal",
  "depth",
  "object_id",
  "material_id",
  "custom",
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

function normalizeBlenderPassType(value: unknown): BlenderPassType {
  if (typeof value !== "string") return "custom";
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (normalized === "object" || normalized === "objectid") return "object_id";
  if (normalized === "material" || normalized === "materialid") return "material_id";
  if (BLENDER_PASS_ORDER.includes(normalized as BlenderPassType)) {
    return normalized as BlenderPassType;
  }
  return "custom";
}

function normalizeBridgeMetadata(metadata: unknown): LayerSourceMetadata {
  const out: LayerSourceMetadata = {};
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return out;

  const source = metadata as Record<string, unknown>;
  const setIfScalar = (key: string, value: unknown) => {
    if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
      out[key] = value as string | number | boolean | null;
    }
  };

  setIfScalar("scene", source.scene);
  setIfScalar("camera", source.camera);
  setIfScalar("frame", source.frame);
  setIfScalar("engine", source.engine);
  setIfScalar("seed", source.seed);

  const width = typeof source.width === "number" ? source.width : undefined;
  const height = typeof source.height === "number" ? source.height : undefined;
  if (width && height) {
    out.resolution = `${width}x${height}`;
  }

  const resolution = source.resolution;
  if (resolution && typeof resolution === "object" && !Array.isArray(resolution)) {
    const r = resolution as Record<string, unknown>;
    const rw = typeof r.width === "number" ? r.width : undefined;
    const rh = typeof r.height === "number" ? r.height : undefined;
    const pct = typeof r.percentage === "number" ? r.percentage : undefined;
    if (rw && rh) {
      out.resolution = pct ? `${rw}x${rh} @ ${pct}%` : `${rw}x${rh}`;
    }
  }

  for (const [key, value] of Object.entries(source)) {
    if (key in out || key === "resolution") continue;
    setIfScalar(key, value);
  }

  return out;
}

const LayersPanel = lazy(() =>
  import("./components/layers-panel").then((m) => ({ default: m.LayersPanel }))
);
const AIPanel = lazy(() =>
  import("./components/ai-panel").then((m) => ({ default: m.AIPanel }))
);
const AdjustmentsPanel = lazy(() =>
  import("./components/adjustments-panel").then((m) => ({ default: m.AdjustmentsPanel }))
);
const HistoryPanel = lazy(() =>
  import("./components/history-panel").then((m) => ({ default: m.HistoryPanel }))
);
const Blender3DPanel = lazy(() =>
  import("./components/blender-3d-panel").then((m) => ({ default: m.Blender3DPanel }))
);

function EditorLayout() {
  useKeyboardShortcuts();
  useElectronMenu();
  useAutoSave();
  const setLayersSilent = useEditorSelector((s) => s.setLayersSilent);
  const setActiveLayerId = useEditorSelector((s) => s.setActiveLayerId);
  const setSelection = useEditorSelector((s) => s.setSelection);
  const setCanvasDimensions = useEditorSelector((s) => s.setCanvasDimensions);
  const addLayer = useEditorSelector((s) => s.addLayer);
  const setLayers = useEditorSelector((s) => s.setLayers);
  const canvasWidth = useEditorSelector((s) => s.canvasWidth);
  const canvasHeight = useEditorSelector((s) => s.canvasHeight);
  const blender3DTabEnabled = isBlender3DTabEnabled();
  const [showLayersPanel, setShowLayersPanel] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [rightTab, setRightTab] = useState<"layers" | "adjust" | "ai" | "history" | "3d">("adjust");

  useEffect(() => {
    if (!blender3DTabEnabled && rightTab === "3d") {
      setRightTab("adjust");
    }
  }, [blender3DTabEnabled, rightTab]);

  const setWindowProjectTitle = useCallback((projectName: string) => {
    const title = `AI Canvas — ${projectName}`;
    document.title = title;
    if (window.electronAPI?.setTitle) {
      window.electronAPI.setTitle(title);
    }
    window.dispatchEvent(new CustomEvent("project-name-changed", { detail: projectName }));
  }, []);

  const applyProject = useCallback((project: ProjectFile) => {
    setCanvasDimensions(project.canvas.width, project.canvas.height);
    setLayersSilent(project.layers);
    setActiveLayerId(project.activeLayerId ?? null);
    setSelection(project.selection ?? null);
    setWindowProjectTitle(project.name || "AI Canvas Project");
  }, [setCanvasDimensions, setLayersSilent, setActiveLayerId, setSelection, setWindowProjectTitle]);

  const buildImageLayerFromDataUrl = useCallback(
    (dataUrl: string, layerName: string, extra?: Partial<Layer>): Promise<Layer> => {
      return new Promise((resolve, reject) => {
        const imageRef = extra?.imageRef || generateImageRef();
        globalImageCache.putSync(dataUrl, imageRef);

        const img = new window.Image();
        img.onload = () => {
          const imgAspect = img.width / img.height;
          let layerHeight = canvasHeight;
          let layerWidth = Math.round(layerHeight * imgAspect);
          if (layerWidth > canvasWidth) {
            layerWidth = canvasWidth;
            layerHeight = Math.round(layerWidth / imgAspect);
          }

          const x = Math.round((canvasWidth - layerWidth) / 2);
          const y = Math.round((canvasHeight - layerHeight) / 2);

          resolve({
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            name: layerName.slice(0, 72),
            visible: true,
            locked: false,
            opacity: 100,
            type: "image",
            blendMode: "normal",
            x,
            y,
            width: layerWidth,
            height: layerHeight,
            ...extra,
            imageRef,
          });
        };
        img.onerror = () => reject(new Error("Failed to decode imported image data."));
        img.src = dataUrl;
      });
    },
    [canvasHeight, canvasWidth]
  );

  const importImageDataUrl = useCallback(async (dataUrl: string, layerName: string) => {
    try {
      const newLayer = await buildImageLayerFromDataUrl(dataUrl, layerName);
      addLayer(newLayer);
    } catch (error) {
      console.warn("[Import] Failed to import image:", error);
    }
  }, [addLayer, buildImageLayerFromDataUrl]);

  const importBlenderBridgePayload = useCallback(async (payload: BlenderBridgeImportMessage) => {
    const fallbackName = payload.kind === "viewport_snapshot" ? "Blender Viewport" : "Blender Render";
    const groupName = (payload.groupName || payload.layerName || fallbackName).slice(0, 80);
    const importId = payload.importId || `imp-${Date.now()}`;
    const groupId = payload.passSetId || importId;

    const rawPasses = Array.isArray(payload.passes) && payload.passes.length
      ? payload.passes
      : payload.dataUrl
        ? [{
            passType: "beauty",
            name: payload.layerName || fallbackName,
            dataUrl: payload.dataUrl,
          }]
        : [];

    const sortedPasses = [...rawPasses]
      .filter((entry) => typeof entry?.dataUrl === "string" && entry.dataUrl.length > 0)
      .sort((a, b) => {
        const aType = normalizeBlenderPassType(a.passType);
        const bType = normalizeBlenderPassType(b.passType);
        return BLENDER_PASS_ORDER.indexOf(aType) - BLENDER_PASS_ORDER.indexOf(bType);
      });

    if (!sortedPasses.length) return;

    const metadata = normalizeBridgeMetadata(payload.metadata);
    const importedLayers: Layer[] = [];

    for (let index = 0; index < sortedPasses.length; index += 1) {
      const pass = sortedPasses[index];
      const passType = normalizeBlenderPassType(pass.passType);
      const passLabel = BLENDER_PASS_LABELS[passType];
      const layerName = sortedPasses.length > 1
        ? `${groupName} · ${passLabel}`
        : (pass.name || groupName || fallbackName);

      const layer = await buildImageLayerFromDataUrl(pass.dataUrl, layerName, {
        visible: passType === "beauty" || index === 0,
        blenderImportId: importId,
        blenderGroupId: groupId,
        blenderGroupName: groupName,
        blenderPassType: passType,
        sourceMetadata: metadata,
      });
      importedLayers.push(layer);
    }

    const currentLayers = useEditorStore.getState().layers;
    setLayers([...importedLayers, ...currentLayers]);
    setActiveLayerId(importedLayers[0].id);
    setRightTab("layers");
    console.log(
      "[BlenderBridge] Imported pass set",
      importId,
      `${importedLayers.length} pass(es)`,
      groupName
    );
  }, [buildImageLayerFromDataUrl, setActiveLayerId, setLayers]);

  const importImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
      void importImageDataUrl(imageData, file.name);
    };
    reader.readAsDataURL(file);
  }, [importImageDataUrl]);

  // Listen for load-project events from keyboard shortcuts
  useEffect(() => {
    const handler = (e: Event) => {
      const project = (e as CustomEvent<ProjectFile>).detail;
      if (project) {
        applyProject(project);
      }
    };
    window.addEventListener("load-project", handler);
    return () => window.removeEventListener("load-project", handler);
  }, [applyProject]);

  useEffect(() => {
    const autosave = getAutoSavedProject();
    if (!autosave) return;

    const savedLabel = new Date(autosave.savedAt).toLocaleString();
    const shouldRecover = window.confirm(`Recover auto-saved project from ${savedLabel}?`);
    if (shouldRecover) {
      applyProject(autosave.project);
    }
    clearAutoSavedProject();
  }, [applyProject]);

  useEffect(() => {
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types?.includes("Files")) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    };

    const onDrop = (event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (!files.length) return;
      event.preventDefault();
      const file = files[0];
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".aicproj") || lowerName.endsWith(".json")) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const project = JSON.parse(reader.result as string) as ProjectFile;
            if (!project.canvas || !Array.isArray(project.layers)) return;
            applyProject(project);
          } catch {
            // Ignore invalid project drops.
          }
        };
        reader.readAsText(file);
        return;
      }

      if (file.type.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name)) {
        importImageFile(file);
      }
    };

    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [applyProject, importImageFile]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onBlenderBridgeImport) return;

    const unsubscribe = api.onBlenderBridgeImport((payload) => {
      if (!payload?.dataUrl && (!payload?.passes || !payload.passes.length)) return;
      void importBlenderBridgePayload(payload);
    });

    return () => {
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, [importBlenderBridgePayload]);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      <HeaderBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <Toolbar />

        {/* Canvas area */}
        <InfiniteCanvas />

        {/* Right panel */}
        <div className="flex flex-col" style={{ width: showLayersPanel || showAIPanel ? 560 : 0 }}>
          {(showLayersPanel || showAIPanel) && (
            <div className="flex flex-col h-full bg-card border-l border-border">
              {/* Panel tabs */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setRightTab("layers")}
                  className={`flex-1 py-2 text-xs text-center transition-colors ${
                    rightTab === "layers"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Layers
                </button>
                <button
                  onClick={() => setRightTab("adjust")}
                  className={`flex-1 py-2 text-xs text-center transition-colors ${
                    rightTab === "adjust"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Adjust
                </button>
                <button
                  onClick={() => setRightTab("ai")}
                  className={`flex-1 py-2 text-xs text-center transition-colors ${
                    rightTab === "ai"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AI Studio
                </button>
                <button
                  onClick={() => setRightTab("history")}
                  className={`flex-1 py-2 text-xs text-center transition-colors ${
                    rightTab === "history"
                      ? "text-foreground border-b-2 border-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  History
                </button>
                {blender3DTabEnabled && (
                  <button
                    onClick={() => setRightTab("3d")}
                    className={`flex-1 py-2 text-xs text-center transition-colors ${
                      rightTab === "3d"
                        ? "text-foreground border-b-2 border-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    3D
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <Suspense
                  fallback={
                    <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                      Loading panel...
                    </div>
                  }
                >
                  {rightTab === "layers" ? (
                    <LayersPanel />
                  ) : rightTab === "adjust" ? (
                    <AdjustmentsPanel />
                  ) : rightTab === "history" ? (
                    <HistoryPanel />
                  ) : rightTab === "3d" ? (
                    <Blender3DPanel />
                  ) : (
                    <AIPanel />
                  )}
                </Suspense>
              </div>
            </div>
          )}
        </div>

        {/* Panel toggle buttons */}
        <div className="absolute right-0 top-12 flex flex-col gap-1 z-10">
          <button
            onClick={() => {
              if (!showLayersPanel && !showAIPanel) {
                setShowLayersPanel(true);
                setShowAIPanel(true);
              } else {
                setShowLayersPanel(false);
                setShowAIPanel(false);
              }
            }}
            className="w-6 h-6 flex items-center justify-center bg-card border border-border rounded-l-md text-muted-foreground hover:text-foreground"
            title="Toggle panels"
          >
            {showLayersPanel || showAIPanel ? (
              <PanelRightClose className="w-3 h-3" />
            ) : (
              <PanelRightOpen className="w-3 h-3" />
            )}
          </button>
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <EditorLayout />
    </ThemeProvider>
  );
}
