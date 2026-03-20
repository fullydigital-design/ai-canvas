import {
  Sun,
  Moon,
  Undo2,
  Redo2,
  Download,
  Upload,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Image,
  Settings2,
  Link2,
  Link2Off,
  X,
  Save,
  FolderOpen,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useTheme } from "./theme-provider";
import { useEditorSelector, type Layer, getLayerImageDataUrl, layerHasImage } from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";
import { flattenLayers } from "./canvas-utils";
import {
  serializeProject,
  downloadProject,
  loadProjectFromFile,
  type ProjectFile,
} from "./project-io";
import { isElectron, saveFileNative, openFileNative } from "./electron-config";
import { useShallow } from "zustand/react/shallow";

const PRESETS = [
  { label: "512 x 512", w: 512, h: 512 },
  { label: "768 x 768", w: 768, h: 768 },
  { label: "1024 x 1024", w: 1024, h: 1024 },
  { label: "1024 x 576 (16:9)", w: 1024, h: 576 },
  { label: "576 x 1024 (9:16)", w: 576, h: 1024 },
  { label: "1280 x 720 (HD)", w: 1280, h: 720 },
  { label: "1920 x 1080 (FHD)", w: 1920, h: 1080 },
  { label: "2048 x 2048", w: 2048, h: 2048 },
];

type ExportFormat = "png" | "jpeg" | "webp";

const EXPORT_FORMATS: Record<ExportFormat, { ext: string; mime: string; label: string }> = {
  png: { ext: "png", mime: "image/png", label: "PNG" },
  jpeg: { ext: "jpg", mime: "image/jpeg", label: "JPEG" },
  webp: { ext: "webp", mime: "image/webp", label: "WebP" },
};

export function HeaderBar() {
  const { theme, toggleTheme } = useTheme();
  const {
    canvasZoom,
    setCanvasZoom,
    setCanvasOffset,
    addLayer,
    layers,
    selection,
    setSelection,
    canvasWidth,
    canvasHeight,
    setCanvasSize,
    undo,
    redo,
    canUndo,
    canRedo,
    activeLayerId,
    setActiveLayerId,
    setCanvasDimensions,
    setLayersSilent,
  } = useEditorSelector(
    useShallow((s) => ({
      canvasZoom: s.canvasZoom,
      setCanvasZoom: s.setCanvasZoom,
      setCanvasOffset: s.setCanvasOffset,
      addLayer: s.addLayer,
      layers: s.layers,
      selection: s.selection,
      setSelection: s.setSelection,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      setCanvasSize: s.setCanvasSize,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      activeLayerId: s.activeLayerId,
      setActiveLayerId: s.setActiveLayerId,
      setCanvasDimensions: s.setCanvasDimensions,
      setLayersSilent: s.setLayersSilent,
    }))
  );

  const [showSizeModal, setShowSizeModal] = useState(false);
  const [sizeW, setSizeW] = useState(canvasWidth);
  const [sizeH, setSizeH] = useState(canvasHeight);
  const [linked, setLinked] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(canvasWidth / canvasHeight);
  const [projectName, setProjectName] = useState("AI Canvas Project");
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showSizeModal) {
      setSizeW(canvasWidth);
      setSizeH(canvasHeight);
      setAspectRatio(canvasWidth / canvasHeight);
    }
  }, [showSizeModal, canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!showSizeModal) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        setShowSizeModal(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSizeModal]);

  useEffect(() => {
    const title = `AI Canvas — ${projectName}`;
    document.title = title;
    if (window.electronAPI?.setTitle) {
      window.electronAPI.setTitle(title);
    }
    window.dispatchEvent(new CustomEvent("project-name-changed", { detail: projectName }));
  }, [projectName]);

  useEffect(() => {
    const onProjectName = (event: Event) => {
      const nextName = (event as CustomEvent<string>).detail;
      if (!nextName || typeof nextName !== "string") return;
      setProjectName((prev) => (prev === nextName ? prev : nextName));
    };
    window.addEventListener("project-name-changed", onProjectName);
    return () => window.removeEventListener("project-name-changed", onProjectName);
  }, []);

  const handleWidthChange = (w: number) => {
    setSizeW(w);
    if (linked) setSizeH(Math.round(w / aspectRatio));
  };

  const handleHeightChange = (h: number) => {
    setSizeH(h);
    if (linked) setSizeW(Math.round(h * aspectRatio));
  };

  const applySize = () => {
    const w = Math.max(64, Math.min(4096, sizeW));
    const h = Math.max(64, Math.min(4096, sizeH));
    setCanvasSize(w, h);
    setShowSizeModal(false);
  };

  const sanitizeFilename = (name: string) =>
    name.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim() || "AI Canvas Project";

  const toBase64DataUrl = (text: string, mimeType: string) => {
    const encoded = encodeURIComponent(text).replace(
      /%([0-9A-F]{2})/g,
      (_, hex) => String.fromCharCode(parseInt(hex, 16)),
    );
    return `data:${mimeType};base64,${btoa(encoded)}`;
  };

  const importImageFromData = (dataUrl: string, layerName: string) => {
    const ref = generateImageRef();
    const img = new window.Image();
    img.onload = () => {
      globalImageCache.putSync(dataUrl, ref);
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
        name: layerName.slice(0, 20),
        visible: true,
        locked: false,
        opacity: 100,
        type: "image",
        imageRef: ref,
        blendMode: "normal",
        x,
        y,
        width: layerWidth,
        height: layerHeight,
      };
      addLayer(newLayer);
    };
    img.src = dataUrl;
  };

  const applyProject = (project: ProjectFile) => {
    setCanvasDimensions(project.canvas.width, project.canvas.height);
    setLayersSilent(project.layers);
    setActiveLayerId(project.activeLayerId ?? null);
    setSelection(project.selection ?? null);
    setProjectName(project.name || "AI Canvas Project");
  };

  const parseProjectText = (text: string) => {
    const parsed = JSON.parse(text) as ProjectFile;
    if (!parsed?.canvas || !Array.isArray(parsed?.layers)) {
      throw new Error("Invalid project file");
    }
    return parsed;
  };

  const handleImportImage = async () => {
    if (isElectron()) {
      const opened = await openFileNative({
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });
      if (!opened || opened.type !== "image" || !opened.data) return;
      importImageFromData(opened.data, "Imported Image");
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importImageFromData(reader.result as string, file.name);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleExport = async (forcedFormat?: ExportFormat) => {
    const format = forcedFormat ?? exportFormat;
    const { ext, mime, label } = EXPORT_FORMATS[format];
    const flattened = await flattenLayers(layers, canvasWidth, canvasHeight);
    const dataUrl = flattened.toDataURL(mime, format === "png" ? undefined : 0.92);

    if (isElectron()) {
      await saveFileNative(dataUrl, `canvas-export.${ext}`, [
        { name: `${label} Image`, extensions: [ext] },
        { name: "All Files", extensions: ["*"] },
      ]);
      return;
    }

    const link = document.createElement("a");
    link.download = `canvas-export.${ext}`;
    link.href = dataUrl;
    link.click();
  };

  const handleSaveProject = async () => {
    const resolvedName = projectName || "AI Canvas Project";
    const project = serializeProject(
      resolvedName,
      layers,
      canvasWidth,
      canvasHeight,
      activeLayerId,
      selection,
    );

    if (isElectron()) {
      const dataUrl = toBase64DataUrl(JSON.stringify(project, null, 2), "application/json");
      const saved = await saveFileNative(dataUrl, `${sanitizeFilename(resolvedName)}.aicproj`, [
        { name: "AI Canvas Project", extensions: ["aicproj"] },
        { name: "JSON", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ]);
      if (!saved) return;
    } else {
      downloadProject(project);
    }

    setProjectName(resolvedName);
  };

  const handleLoadProject = async () => {
    try {
      if (isElectron()) {
        const opened = await openFileNative({
          filters: [
            { name: "AI Canvas Project", extensions: ["aicproj", "json"] },
            { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] },
            { name: "All Files", extensions: ["*"] },
          ],
        });
        if (!opened) return;

        if (opened.type === "image" && opened.data) {
          importImageFromData(opened.data, "Imported Image");
          return;
        }
        if (opened.type === "project" && opened.data) {
          applyProject(parseProjectText(opened.data));
        }
        return;
      }

      const project = await loadProjectFromFile();
      applyProject(project);
    } catch {
      // User cancelled or invalid file; ignore.
    }
  };

  useEffect(() => {
    const handleElectronMenu = (event: Event) => {
      const action = (event as CustomEvent<string>).detail;
      switch (action) {
        case "new": {
          const confirmed = window.confirm("Create a new project? Unsaved changes will be lost.");
          if (confirmed) window.location.reload();
          break;
        }
        case "open":
          void handleLoadProject();
          break;
        case "save":
          void handleSaveProject();
          break;
        case "export-png":
          void handleExport("png");
          break;
      }
    };

    window.addEventListener("electron-menu", handleElectronMenu);
    return () => window.removeEventListener("electron-menu", handleElectronMenu);
  }, [projectName, layers, canvasWidth, canvasHeight, activeLayerId, selection, exportFormat]);

  return (
    <div className="h-10 bg-card border-b border-border flex items-center px-3 gap-1 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-2 mr-4">
        <div className="w-5 h-5 rounded bg-primary flex items-center justify-center">
          <Image className="w-3 h-3 text-primary-foreground" />
        </div>
        <span className="text-sm text-foreground">AI Canvas</span>
      </div>

      {/* Divider */}
      <div className="w-px h-5 bg-border mx-1" />

      {/* File actions */}
      <button
        onClick={() => void handleImportImage()}
        className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Import
      </button>
      <button
        onClick={() => void handleExport()}
        className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Export
      </button>
      <select
        value={exportFormat}
        onChange={(e) => setExportFormat(e.target.value as ExportFormat)}
        className="h-7 px-2 bg-background border border-border rounded-md text-xs text-muted-foreground hover:text-foreground outline-none"
        title="Export format"
      >
        <option value="png">PNG</option>
        <option value="jpeg">JPEG</option>
        <option value="webp">WebP</option>
      </select>
      <button
        onClick={() => void handleSaveProject()}
        className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <Save className="w-3.5 h-3.5" />
        Save Project
      </button>
      <button
        onClick={() => void handleLoadProject()}
        className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Load Project
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Canvas size */}
      <div className="relative">
        <button
          onClick={() => setShowSizeModal(!showSizeModal)}
          className="h-7 px-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          {canvasWidth} x {canvasHeight}
        </button>

        {showSizeModal && (
          <div
            ref={modalRef}
            className="absolute top-full left-0 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg z-50 p-3"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-foreground">Canvas Size</span>
              <button
                onClick={() => setShowSizeModal(false)}
                className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:text-foreground rounded"
              >
                <X className="w-3 h-3" />
              </button>
            </div>

            {/* Width / Height inputs */}
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground mb-1 block">Width</label>
                <input
                  type="number"
                  value={sizeW}
                  min={64}
                  max={4096}
                  onChange={(e) => handleWidthChange(Number(e.target.value))}
                  className="w-full h-7 bg-background border border-border rounded px-2 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
              <button
                onClick={() => {
                  setLinked(!linked);
                  if (!linked) setAspectRatio(sizeW / sizeH);
                }}
                className={`mt-4 w-6 h-6 flex items-center justify-center rounded transition-colors ${
                  linked
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title={linked ? "Unlink dimensions" : "Link dimensions"}
              >
                {linked ? (
                  <Link2 className="w-3.5 h-3.5" />
                ) : (
                  <Link2Off className="w-3.5 h-3.5" />
                )}
              </button>
              <div className="flex-1">
                <label className="text-[10px] text-muted-foreground mb-1 block">Height</label>
                <input
                  type="number"
                  value={sizeH}
                  min={64}
                  max={4096}
                  onChange={(e) => handleHeightChange(Number(e.target.value))}
                  className="w-full h-7 bg-background border border-border rounded px-2 text-xs text-foreground outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Presets */}
            <div className="mb-3">
              <label className="text-[10px] text-muted-foreground mb-1 block">Presets</label>
              <div className="grid grid-cols-2 gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    onClick={() => {
                      setSizeW(p.w);
                      setSizeH(p.h);
                      setAspectRatio(p.w / p.h);
                    }}
                    className={`h-6 px-2 text-[10px] rounded transition-colors ${
                      sizeW === p.w && sizeH === p.h
                        ? "bg-primary/15 text-primary border border-primary/30"
                        : "bg-background text-muted-foreground hover:text-foreground border border-border"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Apply */}
            <button
              onClick={applySize}
              className="w-full h-7 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 transition-colors"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Undo/Redo */}
      <button
        onClick={undo}
        className={`w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors ${
          canUndo ? "" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={redo}
        className={`w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors ${
          canRedo ? "" : "opacity-50 cursor-not-allowed"
        }`}
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-border mx-1" />

      {/* Zoom controls */}
      <button
        onClick={() => setCanvasZoom(Math.max(0.1, canvasZoom / 1.2))}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <ZoomOut className="w-3.5 h-3.5" />
      </button>
      <span className="text-xs text-muted-foreground w-10 text-center">
        {Math.round(canvasZoom * 100)}%
      </span>
      <button
        onClick={() => setCanvasZoom(Math.min(10, canvasZoom * 1.2))}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        <ZoomIn className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={() => {
          const toolbarW = 48;
          const panelW = 560;
          const headerH = 40;
          const viewW = window.innerWidth - toolbarW - panelW;
          const viewH = window.innerHeight - headerH;
          const scaleX = (viewW - 40) / canvasWidth;
          const scaleY = (viewH - 40) / canvasHeight;
          const fitZoom = Math.min(scaleX, scaleY, 2);
          setCanvasZoom(fitZoom);
          setCanvasOffset({
            x: (viewW - canvasWidth * fitZoom) / 2,
            y: (viewH - canvasHeight * fitZoom) / 2,
          });
        }}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
        title="Fit to screen"
      >
        <Maximize2 className="w-3.5 h-3.5" />
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Selection info */}
      {selection && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground mr-2">
          <span>
            Selection: {Math.round(selection.width)}x{Math.round(selection.height)}
          </span>
          <button
            onClick={() => setSelection(null)}
            className="text-xs text-destructive hover:underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
      >
        {theme === "dark" ? (
          <Sun className="w-3.5 h-3.5" />
        ) : (
          <Moon className="w-3.5 h-3.5" />
        )}
      </button>
    </div>
  );
}
