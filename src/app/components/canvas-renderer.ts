/**
 * Canvas Renderer — pure draw functions extracted from infinite-canvas.tsx.
 * No React hooks or state — only canvas 2D drawing operations.
 */
import type { Layer, Selection, Tool, GradientMode } from "./editor-store";
import { layerHasImage, layerHasMask } from "./editor-store";
import { imageCache as globalImageCache } from "./image-cache";
import { applyAllAdjustments, hasActiveAdjustments } from "./adjustment-utils";
import { renderSelectionPath } from "./selection-tools";
import { applyAdjustmentsWebGL, canUseWebGLAdjustments } from "./webgl-adjustments";

/**
 * Resolve the HTMLImageElement for a layer from either the global ImageCache
 * (if the layer uses imageRef) or the component-level cache (legacy imageData).
 */
function resolveLayerImage(
  layer: Layer,
  componentCache: Map<string, HTMLImageElement>,
): HTMLImageElement | undefined {
  if (layer.imageRef) {
    return globalImageCache.getElement(layer.imageRef);
  }
  return componentCache.get(layer.id);
}

export const isDarkMode = () => document.documentElement.classList.contains("dark");

/** Convert a luminance mask (white=show, black=hide) into an alpha mask canvas */
export function luminanceToAlpha(
  src: HTMLCanvasElement | HTMLImageElement,
  w: number,
  h: number,
): HTMLCanvasElement {
  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;
  const tctx = temp.getContext("2d", { willReadFrequently: true })!;
  tctx.drawImage(src, 0, 0, w, h);
  const imgData = tctx.getImageData(0, 0, w, h);
  const d = imgData.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = d[i];
    d[i + 3] = lum;
    d[i] = 255;
    d[i + 1] = 255;
    d[i + 2] = 255;
  }
  tctx.putImageData(imgData, 0, 0);
  return temp;
}

// ─── Render state passed to the main draw function ──────────────────────────
export interface RenderContext {
  canvas: HTMLCanvasElement;
  container: HTMLDivElement;
  layers: Layer[];
  imageCache: Map<string, HTMLImageElement>;
  canvasOffset: { x: number; y: number };
  canvasZoom: number;
  canvasWidth: number;
  canvasHeight: number;
  selection: Selection | null;
  currentSelection: Selection | null;
  editingMaskLayerId: string | null;
  getMaskSource: (layerId: string) => HTMLCanvasElement | HTMLImageElement | null;
  activeTool: Tool;
  activeLayerId: string | null;
  lassoDrawing: boolean;
  lassoPoints: { x: number; y: number }[];
  cloneSource: { x: number; y: number; layerId: string } | null;
  gradientStart: { x: number; y: number } | null;
  gradientEnd: { x: number; y: number } | null;
  brushColor: string;
  gradientEndColor: string;
  gradientMode: GradientMode;
  cropRect: { x: number; y: number; w: number; h: number } | null;
  isPainting: boolean;
  brushOffscreen: HTMLCanvasElement | null;
  brushOffscreenLayerId: string | null;
  cloneOffscreen: HTMLCanvasElement | null;
  cloneOffscreenLayerId: string | null;
}

// ─── Grid ────────────────────────────────────────────────────────────────────
function drawGrid(ctx: CanvasRenderingContext2D, cw: number, ch: number, offset: { x: number; y: number }, zoom: number) {
  const dark = isDarkMode();
  const gridSize = 50 * zoom;
  if (gridSize <= 8) return;
  ctx.save();
  const startX = offset.x % gridSize;
  const startY = offset.y % gridSize;
  ctx.fillStyle = dark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.08)";
  for (let x = startX; x < cw; x += gridSize) {
    for (let y = startY; y < ch; y += gridSize) {
      ctx.beginPath();
      ctx.arc(x, y, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ─── Checkerboard ────────────────────────────────────────────────────────────
function drawCheckerboard(ctx: CanvasRenderingContext2D, docW: number, docH: number) {
  const dark = isDarkMode();
  const tileSize = 16;
  for (let y = 0; y < docH; y += tileSize) {
    for (let x = 0; x < docW; x += tileSize) {
      const isEven = (x / tileSize + y / tileSize) % 2 === 0;
      ctx.fillStyle = dark
        ? isEven ? "#2a2a2a" : "#222222"
        : isEven ? "#e8e8e8" : "#d8d8d8";
      ctx.fillRect(x, y, tileSize, tileSize);
    }
  }
}

// ─── Draw text on a canvas context (shared helper) ──────────────────────────
export function renderTextContent(
  tctx: CanvasRenderingContext2D,
  layer: Layer,
) {
  if (!layer.textContent) return;
  const fontSize = layer.textSize || 32;
  const fontFamily = layer.textFont || "Inter";
  const weight = layer.textBold ? "bold" : "normal";
  const style = layer.textItalic ? "italic" : "normal";
  const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
  tctx.fillStyle = layer.textColor || "#000000";
  tctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
  tctx.textBaseline = "top";
  tctx.textAlign = layer.textAlign || "left";
  const textX =
    layer.textAlign === "center" ? layer.width / 2
    : layer.textAlign === "right" ? layer.width
    : 0;
  layer.textContent.split("\n").forEach((line, lineIdx) => {
    tctx.fillText(line, textX, lineIdx * lineHeight);
  });
}

// ─── Draw a single layer's content to an offscreen context ──────────────────
function drawLayerContent(
  cctx: CanvasRenderingContext2D,
  layer: Layer,
  componentCache: Map<string, HTMLImageElement>,
) {
  if (layer.type === "fill") {
    cctx.fillStyle = layer.fillColor || "#ffffff";
    cctx.fillRect(0, 0, layer.width, layer.height);
  } else if (layer.type === "text" && layer.textContent) {
    renderTextContent(cctx, layer);
  } else if (layerHasImage(layer)) {
    const img = resolveLayerImage(layer, componentCache);
    if (img && img.complete) {
      cctx.drawImage(img, 0, 0, layer.width, layer.height);
    }
  }
}

// ─── Apply adjustments to an offscreen context if active ────────────────────
function applyLayerAdjustments(cctx: CanvasRenderingContext2D, layer: Layer) {
  if (hasActiveAdjustments(layer.adjustments)) {
    const cw = cctx.canvas.width;
    const ch = cctx.canvas.height;
    if (layer.adjustments && canUseWebGLAdjustments(layer.adjustments)) {
      const glCanvas = applyAdjustmentsWebGL(
        cctx.canvas as HTMLCanvasElement,
        cw,
        ch,
        layer.adjustments,
      );
      if (glCanvas) {
        cctx.clearRect(0, 0, cw, ch);
        cctx.drawImage(glCanvas, 0, 0, cw, ch);
        return;
      }
    }
    const adjData = cctx.getImageData(0, 0, cw, ch);
    applyAllAdjustments(adjData, layer.adjustments!);
    cctx.putImageData(adjData, 0, 0);
  }
}

// ─── Draw layers (bottom-to-top) ────────────────────────────────────────────
function drawLayers(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  const reversedLayers = [...rc.layers].reverse();
  for (const layer of reversedLayers) {
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation =
      layer.blendMode === "normal" ? "source-over" : layer.blendMode as GlobalCompositeOperation;

    const hasMask = layerHasMask(layer) && layer.maskEnabled;
    const maskSrc = hasMask ? rc.getMaskSource(layer.id) : null;

    if (hasMask && maskSrc) {
      const img = layerHasImage(layer) ? resolveLayerImage(layer, rc.imageCache) : undefined;
      const compW = img && img.complete && img.naturalWidth > 0 ? img.naturalWidth : layer.width;
      const compH = img && img.complete && img.naturalHeight > 0 ? img.naturalHeight : layer.height;

      // Composite layer + mask on offscreen canvas
      const comp = document.createElement("canvas");
      comp.width = compW;
      comp.height = compH;
      const needsReadback = hasActiveAdjustments(layer.adjustments);
      const cctx = needsReadback
        ? comp.getContext("2d", { willReadFrequently: true })!
        : comp.getContext("2d")!;
      cctx.imageSmoothingEnabled = true;
      cctx.imageSmoothingQuality = "high";
      if (img && img.complete) {
        cctx.drawImage(img, 0, 0, compW, compH);
      } else {
        drawLayerContent(cctx, layer, rc.imageCache);
      }
      applyLayerAdjustments(cctx, layer);
      const alphaMask = luminanceToAlpha(maskSrc, compW, compH);
      cctx.globalCompositeOperation = "destination-in";
      cctx.drawImage(alphaMask, 0, 0, compW, compH);
      ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
    } else {
      // Brush/Eraser live preview
      if (rc.brushOffscreen && rc.brushOffscreenLayerId === layer.id) {
        ctx.drawImage(rc.brushOffscreen, layer.x, layer.y, layer.width, layer.height);
        ctx.restore();
        continue;
      }

      // Clone stamp live preview
      const cloneActive = rc.cloneOffscreen && rc.cloneOffscreenLayerId === layer.id;

      if (layer.type === "fill") {
        if (hasActiveAdjustments(layer.adjustments)) {
          const comp = document.createElement("canvas");
          comp.width = layer.width;
          comp.height = layer.height;
          const cctx = comp.getContext("2d", { willReadFrequently: true })!;
          cctx.fillStyle = layer.fillColor || "#ffffff";
          cctx.fillRect(0, 0, layer.width, layer.height);
          applyLayerAdjustments(cctx, layer);
          ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
        } else {
          ctx.fillStyle = layer.fillColor || "#ffffff";
          ctx.fillRect(layer.x, layer.y, layer.width, layer.height);
        }
      } else if (layer.type === "text" && layer.textContent) {
        if (hasActiveAdjustments(layer.adjustments)) {
          const tcomp = document.createElement("canvas");
          tcomp.width = layer.width;
          tcomp.height = layer.height;
          const tctx = tcomp.getContext("2d", { willReadFrequently: true })!;
          renderTextContent(tctx, layer);
          applyLayerAdjustments(tctx, layer);
          ctx.drawImage(tcomp, layer.x, layer.y, layer.width, layer.height);
        } else {
          ctx.save();
          ctx.translate(layer.x, layer.y);
          renderTextContent(ctx, layer);
          ctx.restore();
        }
      } else if (layerHasImage(layer) || cloneActive) {
        if (cloneActive) {
          ctx.drawImage(rc.cloneOffscreen!, layer.x, layer.y, layer.width, layer.height);
        } else {
          const img = resolveLayerImage(layer, rc.imageCache);
          if (img && img.complete) {
            if (hasActiveAdjustments(layer.adjustments)) {
              const compW = img.naturalWidth > 0 ? img.naturalWidth : layer.width;
              const compH = img.naturalHeight > 0 ? img.naturalHeight : layer.height;
              const comp = document.createElement("canvas");
              comp.width = compW;
              comp.height = compH;
              const cctx2 = comp.getContext("2d", { willReadFrequently: true })!;
              cctx2.imageSmoothingEnabled = true;
              cctx2.imageSmoothingQuality = "high";
              cctx2.drawImage(img, 0, 0, compW, compH);
              applyLayerAdjustments(cctx2, layer);
              ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
            } else {
              ctx.drawImage(img, layer.x, layer.y, layer.width, layer.height);
            }
          }
        }
      }
    }
    ctx.restore();
  }
}


// ─── Mask editing overlay ───────────────────────────────────────────────────
function drawMaskOverlay(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  if (!rc.editingMaskLayerId) return;
  const maskLayer = rc.layers.find((l) => l.id === rc.editingMaskLayerId);
  const maskSrc = maskLayer ? rc.getMaskSource(maskLayer.id) : null;
  if (!maskLayer || !maskSrc) return;

  const dark = isDarkMode();
  const overlay = document.createElement("canvas");
  overlay.width = maskLayer.width;
  overlay.height = maskLayer.height;
  const octx = overlay.getContext("2d")!;
  octx.fillStyle = dark ? "rgba(255, 60, 60, 1)" : "rgba(255, 40, 40, 1)";
  octx.fillRect(0, 0, maskLayer.width, maskLayer.height);
  const alphaMask = luminanceToAlpha(maskSrc, maskLayer.width, maskLayer.height);
  octx.globalCompositeOperation = "destination-out";
  octx.drawImage(alphaMask, 0, 0, maskLayer.width, maskLayer.height);

  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.drawImage(overlay, maskLayer.x, maskLayer.y, maskLayer.width, maskLayer.height);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "#ff6b6b";
  ctx.lineWidth = 2 / rc.canvasZoom;
  ctx.setLineDash([8 / rc.canvasZoom, 4 / rc.canvasZoom]);
  ctx.lineDashOffset = -(Date.now() / 80) % 20;
  ctx.strokeRect(maskLayer.x, maskLayer.y, maskLayer.width, maskLayer.height);
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Selection overlay ──────────────────────────────────────────────────────
function drawSelection(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  const sel = rc.currentSelection || rc.selection;
  if (!sel) return;

  if (sel.path && sel.path.points.length > 2) {
    renderSelectionPath(ctx, sel.path, rc.canvasZoom);
  }

  ctx.strokeStyle = "#3ECF8E";
  ctx.lineWidth = 2 / rc.canvasZoom;
  ctx.setLineDash([6 / rc.canvasZoom, 4 / rc.canvasZoom]);
  ctx.strokeRect(sel.x, sel.y, sel.width, sel.height);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(62, 207, 142, 0.08)";
  ctx.fillRect(sel.x, sel.y, sel.width, sel.height);

  const handleSize = 6 / rc.canvasZoom;
  ctx.fillStyle = "#3ECF8E";
  [
    { x: sel.x, y: sel.y },
    { x: sel.x + sel.width, y: sel.y },
    { x: sel.x, y: sel.y + sel.height },
    { x: sel.x + sel.width, y: sel.y + sel.height },
  ].forEach((c) => {
    ctx.fillRect(c.x - handleSize / 2, c.y - handleSize / 2, handleSize, handleSize);
  });
}

// ─── Lasso preview ──────────────────────────────────────────────────────────
function drawLassoPreview(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  if (!rc.lassoDrawing || rc.lassoPoints.length < 2) return;
  const pts = rc.lassoPoints;
  ctx.save();
  ctx.strokeStyle = "#3ECF8E";
  ctx.lineWidth = 1.5 / rc.canvasZoom;
  ctx.setLineDash([4 / rc.canvasZoom, 3 / rc.canvasZoom]);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.stroke();
  ctx.strokeStyle = "rgba(62, 207, 142, 0.4)";
  ctx.beginPath();
  ctx.moveTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
  ctx.lineTo(pts[0].x, pts[0].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ─── Clone source indicator ─────────────────────────────────────────────────
function drawCloneSource(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  if (!rc.cloneSource || (rc.activeTool !== "clone-stamp" && rc.activeTool !== "healing-brush")) return;
  const src = rc.cloneSource;
  ctx.save();
  ctx.strokeStyle = rc.activeTool === "clone-stamp" ? "#3ECF8E" : "#60A5FA";
  ctx.lineWidth = 1.5 / rc.canvasZoom;
  const crossSize = 8 / rc.canvasZoom;
  ctx.beginPath();
  ctx.moveTo(src.x - crossSize, src.y);
  ctx.lineTo(src.x + crossSize, src.y);
  ctx.moveTo(src.x, src.y - crossSize);
  ctx.lineTo(src.x, src.y + crossSize);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(src.x, src.y, crossSize * 1.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// ─── Gradient preview ───────────────────────────────────────────────────────
function drawGradientPreview(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  if (rc.activeTool !== "gradient" || !rc.gradientStart || !rc.gradientEnd || !rc.isPainting) return;
  ctx.save();
  if (rc.gradientMode === "radial") {
    const radius = Math.hypot(rc.gradientEnd.x - rc.gradientStart.x, rc.gradientEnd.y - rc.gradientStart.y);
    const grad = ctx.createRadialGradient(
      rc.gradientStart.x, rc.gradientStart.y, 0,
      rc.gradientStart.x, rc.gradientStart.y, radius,
    );
    grad.addColorStop(0, rc.brushColor + "44");
    grad.addColorStop(1, rc.gradientEndColor + "44");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(rc.gradientStart.x, rc.gradientStart.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(62, 207, 142, 0.5)";
    ctx.lineWidth = 1.5 / rc.canvasZoom;
    ctx.setLineDash([6 / rc.canvasZoom, 4 / rc.canvasZoom]);
    ctx.beginPath();
    ctx.arc(rc.gradientStart.x, rc.gradientStart.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(62, 207, 142, 0.35)";
    ctx.lineWidth = 1 / rc.canvasZoom;
    ctx.beginPath();
    ctx.moveTo(rc.gradientStart.x, rc.gradientStart.y);
    ctx.lineTo(rc.gradientEnd.x, rc.gradientEnd.y);
    ctx.stroke();
  } else {
    const grad = ctx.createLinearGradient(
      rc.gradientStart.x, rc.gradientStart.y,
      rc.gradientEnd.x, rc.gradientEnd.y,
    );
    grad.addColorStop(0, rc.brushColor + "88");
    grad.addColorStop(1, rc.gradientEndColor + "88");
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3 / rc.canvasZoom;
    ctx.setLineDash([6 / rc.canvasZoom, 4 / rc.canvasZoom]);
    ctx.beginPath();
    ctx.moveTo(rc.gradientStart.x, rc.gradientStart.y);
    ctx.lineTo(rc.gradientEnd.x, rc.gradientEnd.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.fillStyle = rc.brushColor;
  ctx.beginPath();
  ctx.arc(rc.gradientStart.x, rc.gradientStart.y, 4 / rc.canvasZoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = rc.gradientEndColor;
  ctx.beginPath();
  ctx.arc(rc.gradientEnd.x, rc.gradientEnd.y, 4 / rc.canvasZoom, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ─── Crop overlay ───────────────────────────────────────────────────────────
function drawCropOverlay(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  const cr = rc.cropRect;
  if (rc.activeTool !== "crop" || !cr || cr.w <= 0 || cr.h <= 0) return;
  const docW = rc.canvasWidth;
  const docH = rc.canvasHeight;
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, 0, docW, cr.y);
  ctx.fillRect(0, cr.y + cr.h, docW, docH - cr.y - cr.h);
  ctx.fillRect(0, cr.y, cr.x, cr.h);
  ctx.fillRect(cr.x + cr.w, cr.y, docW - cr.x - cr.w, cr.h);

  ctx.strokeStyle = "#3ECF8E";
  ctx.lineWidth = 2 / rc.canvasZoom;
  ctx.setLineDash([]);
  ctx.strokeRect(cr.x, cr.y, cr.w, cr.h);

  ctx.strokeStyle = "rgba(62, 207, 142, 0.25)";
  ctx.lineWidth = 1 / rc.canvasZoom;
  for (let i = 1; i <= 2; i++) {
    const rx = cr.x + (cr.w * i) / 3;
    const ry = cr.y + (cr.h * i) / 3;
    ctx.beginPath(); ctx.moveTo(rx, cr.y); ctx.lineTo(rx, cr.y + cr.h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cr.x, ry); ctx.lineTo(cr.x + cr.w, ry); ctx.stroke();
  }

  const cLabel = `${Math.round(cr.w)} x ${Math.round(cr.h)}`;
  const cFontSize = 10 / rc.canvasZoom;
  ctx.fillStyle = "rgba(62, 207, 142, 0.9)";
  ctx.font = `${cFontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(cLabel, cr.x + cr.w / 2, cr.y - 6 / rc.canvasZoom);

  const chs = 6 / rc.canvasZoom;
  ctx.fillStyle = "#3ECF8E";
  [
    { x: cr.x, y: cr.y },
    { x: cr.x + cr.w, y: cr.y },
    { x: cr.x, y: cr.y + cr.h },
    { x: cr.x + cr.w, y: cr.y + cr.h },
  ].forEach((c) => {
    ctx.fillRect(c.x - chs / 2, c.y - chs / 2, chs, chs);
  });
  ctx.restore();
}

// ─── Transform handles ──────────────────────────────────────────────────────
function drawTransformHandles(ctx: CanvasRenderingContext2D, rc: RenderContext) {
  if (rc.activeTool !== "transform" || !rc.activeLayerId) return;
  const tLayer = rc.layers.find((l) => l.id === rc.activeLayerId);
  if (!tLayer) return;
  const dark = isDarkMode();
  const { x: lx, y: ly, width: lw, height: lh } = tLayer;

  ctx.strokeStyle = "#3ECF8E";
  ctx.lineWidth = 1.5 / rc.canvasZoom;
  ctx.setLineDash([]);
  ctx.strokeRect(lx, ly, lw, lh);

  ctx.strokeStyle = "rgba(62, 207, 142, 0.15)";
  ctx.lineWidth = 0.5 / rc.canvasZoom;
  ctx.beginPath();
  ctx.moveTo(lx, ly); ctx.lineTo(lx + lw, ly + lh);
  ctx.moveTo(lx + lw, ly); ctx.lineTo(lx, ly + lh);
  ctx.stroke();

  const hs = 7 / rc.canvasZoom;
  const handles = [
    { x: lx, y: ly }, { x: lx + lw / 2, y: ly }, { x: lx + lw, y: ly },
    { x: lx + lw, y: ly + lh / 2 }, { x: lx + lw, y: ly + lh },
    { x: lx + lw / 2, y: ly + lh }, { x: lx, y: ly + lh }, { x: lx, y: ly + lh / 2 },
  ];
  handles.forEach((h) => {
    ctx.fillStyle = "#3ECF8E";
    ctx.strokeStyle = dark ? "#1a1a2e" : "#ffffff";
    ctx.lineWidth = 1.5 / rc.canvasZoom;
    ctx.fillRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
    ctx.strokeRect(h.x - hs / 2, h.y - hs / 2, hs, hs);
  });

  const label = `${Math.round(lw)} x ${Math.round(lh)}`;
  ctx.fillStyle = "rgba(62, 207, 142, 0.85)";
  const fontSize = 10 / rc.canvasZoom;
  ctx.font = `${fontSize}px Inter, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText(label, lx + lw / 2, ly - 6 / rc.canvasZoom);
}

// ═══════════════════════════════════════════════════════════════════════════
// Main render entry point
// ═══════════════════════════════════════════════════════════════════════════
export function renderCanvas(rc: RenderContext): void {
  const canvas = rc.canvas;
  const container = rc.container;
  const ctx =
    canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
    canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const dpr = window.devicePixelRatio || 1;
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  const targetWidth = Math.max(1, Math.round(cw * dpr));
  const targetHeight = Math.max(1, Math.round(ch * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
  }
  // Keep drawing in CSS pixel space while preserving DPR sharpness.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, cw, ch);

  // Grid dots behind everything
  drawGrid(ctx, cw, ch, rc.canvasOffset, rc.canvasZoom);

  // Enter document coordinate space
  ctx.save();
  ctx.translate(rc.canvasOffset.x, rc.canvasOffset.y);
  ctx.scale(rc.canvasZoom, rc.canvasZoom);

  const docW = rc.canvasWidth;
  const docH = rc.canvasHeight;

  // Checkerboard
  drawCheckerboard(ctx, docW, docH);

  // Layers and content overlays should be clipped to current document bounds.
  // This is required for crop behavior: after shrinking canvas dimensions,
  // oversized layers must not render outside the cropped rectangle.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, docW, docH);
  ctx.clip();
  drawLayers(ctx, rc);
  drawMaskOverlay(ctx, rc);
  drawSelection(ctx, rc);
  ctx.restore();

  // Document border
  const dark = isDarkMode();
  ctx.strokeStyle = dark ? "rgba(62, 207, 142, 0.25)" : "rgba(62, 207, 142, 0.35)";
  ctx.lineWidth = 1 / rc.canvasZoom;
  ctx.setLineDash([]);
  ctx.strokeRect(0, 0, docW, docH);

  drawLassoPreview(ctx, rc);
  drawCloneSource(ctx, rc);
  drawGradientPreview(ctx, rc);
  drawCropOverlay(ctx, rc);
  drawTransformHandles(ctx, rc);

  ctx.restore();
}
