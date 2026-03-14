/**
 * Global keyboard shortcuts for the editor.
 * Handles tool switching, undo/redo, brush size, selection, zoom, and more.
 */
import { useEffect } from "react";
import { useEditor, type Tool } from "./editor-store";
import {
  serializeProject,
  downloadProject,
  loadProjectFromFile,
} from "./project-io";

export function useKeyboardShortcuts() {
  const {
    activeTool,
    setActiveTool,
    undo,
    redo,
    canUndo,
    canRedo,
    brushSize,
    setBrushSize,
    selection,
    setSelection,
    activeLayerId,
    removeLayer,
    layers,
    addLayer,
    canvasZoom,
    setCanvasZoom,
    setCanvasOffset,
    canvasWidth,
    canvasHeight,
    editingMaskLayerId,
    setEditingMaskLayerId,
    pushHistory,
  } = useEditor();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        // Still allow Ctrl+Z/Y/S/O in inputs
        if (!e.ctrlKey && !e.metaKey) return;
        if (!["z", "y", "s", "o"].includes(e.key.toLowerCase())) return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      // ─── Undo/Redo ───────────────────────────────────────
      if (ctrl && key === "z" && !shift) {
        e.preventDefault();
        if (canUndo) undo();
        return;
      }
      if ((ctrl && key === "z" && shift) || (ctrl && key === "y")) {
        e.preventDefault();
        if (canRedo) redo();
        return;
      }

      // ─── Save / Open project ─────────────────────────────
      if (ctrl && key === "s" && !shift) {
        e.preventDefault();
        const project = serializeProject(
          "AI Canvas Project",
          layers,
          canvasWidth,
          canvasHeight,
          activeLayerId,
          selection,
        );
        downloadProject(project);
        return;
      }
      if (ctrl && key === "o" && !shift) {
        e.preventDefault();
        // Fire and forget — loadProjectFromFile shows file dialog
        loadProjectFromFile().then((project) => {
          // We need setLayers/setCanvasSize which aren't directly available here,
          // so we dispatch a custom event that App.tsx can listen for
          window.dispatchEvent(new CustomEvent("load-project", { detail: project }));
        }).catch(() => {});
        return;
      }

      // ─── Tool shortcuts (only when not Ctrl) ─────────────
      if (!ctrl && !e.altKey) {
        const toolMap: Record<string, Tool> = {
          v: "select",
          m: "move",
          t: "transform",
          r: "rectangle-select",
          l: "lasso",
          w: "magic-wand",
          b: editingMaskLayerId ? "mask-brush" : "brush",
          e: editingMaskLayerId ? "mask-eraser" : "eraser",
          s: "clone-stamp",
          j: "healing-brush",
          i: "eyedropper",
          g: "gradient",
          c: "crop",
          y: "text",
          h: "hand",
          z: "zoom",
        };

        if (toolMap[key]) {
          e.preventDefault();
          setActiveTool(toolMap[key]);
          return;
        }
      }

      // ─── Brush size ──────────────────────────────────────
      if (key === "[") {
        e.preventDefault();
        setBrushSize(Math.max(1, brushSize - (shift ? 10 : 5)));
        return;
      }
      if (key === "]") {
        e.preventDefault();
        setBrushSize(Math.min(200, brushSize + (shift ? 10 : 5)));
        return;
      }

      // ─── Selection ───────────────────────────────────────
      if (ctrl && key === "d") {
        e.preventDefault();
        setSelection(null);
        return;
      }
      if (ctrl && key === "a") {
        e.preventDefault();
        setSelection({ x: 0, y: 0, width: canvasWidth, height: canvasHeight });
        return;
      }

      // ─── Delete layer ────────────────────────────────────
      if ((key === "delete" || key === "backspace") && !ctrl && activeLayerId && layers.length > 1) {
        // Only delete if not in a text field (already filtered above)
        e.preventDefault();
        removeLayer(activeLayerId);
        return;
      }

      // ─── New layer ───────────────────────────────────────
      if (ctrl && shift && key === "n") {
        e.preventDefault();
        addLayer({
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
        });
        return;
      }

      // ─── Zoom shortcuts ─────────────────────────────────
      if (ctrl && (key === "=" || key === "+")) {
        e.preventDefault();
        setCanvasZoom(Math.min(10, canvasZoom * 1.25));
        return;
      }
      if (ctrl && key === "-") {
        e.preventDefault();
        setCanvasZoom(Math.max(0.1, canvasZoom / 1.25));
        return;
      }
      if (ctrl && key === "0") {
        e.preventDefault();
        // Fit to screen
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
        return;
      }
      if (ctrl && key === "1") {
        e.preventDefault();
        setCanvasZoom(1);
        const toolbarW = 48;
        const panelW = 560;
        const headerH = 40;
        const viewW = window.innerWidth - toolbarW - panelW;
        const viewH = window.innerHeight - headerH;
        setCanvasOffset({
          x: (viewW - canvasWidth) / 2,
          y: (viewH - canvasHeight) / 2,
        });
        return;
      }

      // ─── Escape: exit mask editing, deselect ─────────────
      if (key === "escape") {
        if (editingMaskLayerId) {
          setEditingMaskLayerId(null);
          if (activeTool === "mask-brush" || activeTool === "mask-eraser") {
            setActiveTool("move");
          }
        } else if (selection) {
          setSelection(null);
        }
        return;
      }

      // ─── Space: temporary hand tool (handled via keydown/keyup) ──
      // Note: Space+drag for temporary pan is handled in the canvas component
    };

    // ─── Space bar for temporary pan ─────────────────────────
    let previousTool: Tool | null = null;

    const handleSpaceDown = (e: KeyboardEvent) => {
      if (e.key === " " && !e.repeat) {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        previousTool = activeTool;
        setActiveTool("hand");
      }
    };

    const handleSpaceUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        const target = e.target as HTMLElement;
        if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
        e.preventDefault();
        if (previousTool) {
          setActiveTool(previousTool);
          previousTool = null;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keydown", handleSpaceDown);
    window.addEventListener("keyup", handleSpaceUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keydown", handleSpaceDown);
      window.removeEventListener("keyup", handleSpaceUp);
    };
  }, [
    activeTool,
    setActiveTool,
    undo,
    redo,
    canUndo,
    canRedo,
    brushSize,
    setBrushSize,
    selection,
    setSelection,
    activeLayerId,
    removeLayer,
    layers,
    addLayer,
    canvasZoom,
    setCanvasZoom,
    setCanvasOffset,
    canvasWidth,
    canvasHeight,
    editingMaskLayerId,
    setEditingMaskLayerId,
    pushHistory,
  ]);
}