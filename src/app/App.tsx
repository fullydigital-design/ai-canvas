import { ThemeProvider } from "./components/theme-provider";
import { EditorProvider, useEditor, type Layer } from "./components/editor-store";
import { HeaderBar } from "./components/header-bar";
import { Toolbar } from "./components/toolbar";
import { InfiniteCanvas } from "./components/infinite-canvas";
import { LayersPanel } from "./components/layers-panel";
import { AIPanel } from "./components/ai-panel";
import { AdjustmentsPanel } from "./components/adjustments-panel";
import { useKeyboardShortcuts } from "./components/keyboard-shortcuts";
import { useElectronMenu } from "./components/use-electron-menu";
import { useState, useEffect, useCallback } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import type { ProjectFile } from "./components/project-io";
import { HistoryPanel } from "./components/history-panel";
import { StatusBar } from "./components/status-bar";
import { clearAutoSavedProject, getAutoSavedProject, useAutoSave } from "./components/auto-save";

function EditorLayout() {
  useKeyboardShortcuts();
  useElectronMenu();
  useAutoSave();
  const {
    setLayersSilent,
    setActiveLayerId,
    setSelection,
    setCanvasDimensions,
    addLayer,
    canvasWidth,
    canvasHeight,
  } = useEditor();
  const [showLayersPanel, setShowLayersPanel] = useState(true);
  const [showAIPanel, setShowAIPanel] = useState(true);
  const [rightTab, setRightTab] = useState<"layers" | "adjust" | "ai" | "history">("adjust");

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

  const importImageFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const imageData = reader.result as string;
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

        const newLayer: Layer = {
          id: `img-${Date.now()}`,
          name: file.name.slice(0, 20),
          visible: true,
          locked: false,
          opacity: 100,
          type: "image",
          imageData,
          blendMode: "normal",
          x,
          y,
          width: layerWidth,
          height: layerHeight,
        };
        addLayer(newLayer);
      };
      img.src = imageData;
    };
    reader.readAsDataURL(file);
  }, [addLayer, canvasHeight, canvasWidth]);

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
              </div>
              <div className="flex-1 overflow-hidden">
                {rightTab === "layers" ? (
                  <LayersPanel />
                ) : rightTab === "adjust" ? (
                  <AdjustmentsPanel />
                ) : rightTab === "history" ? (
                  <HistoryPanel />
                ) : (
                  <AIPanel />
                )}
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
      <EditorProvider>
        <EditorLayout />
      </EditorProvider>
    </ThemeProvider>
  );
}
