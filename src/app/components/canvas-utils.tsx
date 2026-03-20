/**
 * Canvas utilities for flattening layers, extracting selections,
 * and extracting masks for AI pipeline input/output.
 */
import type { Layer, Selection } from "./editor-store";
import { getLayerImageDataUrl, getLayerMaskDataUrl, layerHasImage, layerHasMask } from "./editor-store";
import { applyAllAdjustments, hasActiveAdjustments } from "./adjustment-utils";
import type {
  ImageWorkerRequest,
  ImageWorkerResponse,
  WorkerLayer,
} from "./image-processing-types";

// ─── Image Loading Cache ──────────────────────────────────────────────
const imgLoadCache = new Map<string, HTMLImageElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imgLoadCache.get(src);
  if (cached && cached.complete && cached.naturalWidth > 0) {
    return Promise.resolve(cached);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgLoadCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

let _imageWorker: Worker | null = null;
let _imageWorkerReqId = 0;
const _imageWorkerPending = new Map<
  number,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>();

function supportsWorkerProcessing() {
  return (
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined"
  );
}

function getImageWorker(): Worker | null {
  if (!supportsWorkerProcessing()) return null;
  if (_imageWorker) return _imageWorker;
  _imageWorker = new Worker(
    new URL("./image-processing.worker.ts", import.meta.url),
    { type: "module" },
  );
  _imageWorker.onmessage = (event: MessageEvent<ImageWorkerResponse>) => {
    const res = event.data;
    const pending = _imageWorkerPending.get(res.id);
    if (!pending) return;
    _imageWorkerPending.delete(res.id);
    if (res.ok) {
      pending.resolve(res.blob);
    } else {
      pending.reject(new Error(res.error));
    }
  };
  _imageWorker.onerror = (event) => {
    const err = new Error(event.message || "Image worker failed");
    _imageWorkerPending.forEach(({ reject }) => reject(err));
    _imageWorkerPending.clear();
    _imageWorker?.terminate();
    _imageWorker = null;
  };
  return _imageWorker;
}

function runImageWorker(request: Omit<ImageWorkerRequest, "id">): Promise<Blob> {
  const worker = getImageWorker();
  if (!worker) {
    return Promise.reject(new Error("Worker processing not available"));
  }
  return new Promise((resolve, reject) => {
    const id = ++_imageWorkerReqId;
    _imageWorkerPending.set(id, { resolve, reject });
    worker.postMessage({ ...request, id });
  });
}

function layerToWorkerLayer(layer: Layer): WorkerLayer {
  return {
    id: layer.id,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    type: layer.type,
    blendMode: layer.blendMode,
    x: layer.x,
    y: layer.y,
    width: layer.width,
    height: layer.height,
    fillColor: layer.fillColor,
    maskEnabled: layer.maskEnabled,
    adjustments: layer.adjustments,
    textContent: layer.textContent,
    textFont: layer.textFont,
    textSize: layer.textSize,
    textColor: layer.textColor,
    textAlign: layer.textAlign,
    textBold: layer.textBold,
    textItalic: layer.textItalic,
    textLineHeight: layer.textLineHeight,
    imageDataUrl: getLayerImageDataUrl(layer),
    maskDataUrl: getLayerMaskDataUrl(layer),
  };
}

async function blobToCanvas(blob: Blob, width: number, height: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    return canvas;
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Failed to decode worker blob"));
      el.src = url;
    });
    ctx.drawImage(img, 0, 0, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
  return canvas;
}

// ─── Luminance to Alpha (same as in infinite-canvas) ──────────────────
function luminanceToAlpha(
  src: HTMLCanvasElement | HTMLImageElement,
  w: number,
  h: number
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

// ─── Flatten All Visible Layers ───────────────────────────────────────
/**
 * Renders all visible layers into a single canvas, respecting blend modes,
 * opacity, masks, and adjustments. Returns a canvas of docW x docH.
 */
async function flattenLayersMainThread(
  layers: Layer[],
  docW: number,
  docH: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = docW;
  canvas.height = docH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  // Render bottom-to-top (layers array is top-first, so reverse)
  const ordered = [...layers].reverse();

  for (const layer of ordered) {
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation =
      layer.blendMode === "normal"
        ? "source-over"
        : (layer.blendMode as GlobalCompositeOperation);

    const hasMask = layerHasMask(layer) && layer.maskEnabled;

    // Render layer content to a temp canvas
    const comp = document.createElement("canvas");
    comp.width = layer.width;
    comp.height = layer.height;
    const cctx = comp.getContext("2d", { willReadFrequently: true })!;

    if (layer.type === "fill") {
      cctx.fillStyle = layer.fillColor || "#ffffff";
      cctx.fillRect(0, 0, layer.width, layer.height);
    } else if (layer.type === "text" && layer.textContent) {
      // Render text layer content
      const fontSize = layer.textSize || 32;
      const fontFamily = layer.textFont || "Inter";
      const weight = layer.textBold ? "bold" : "normal";
      const style = layer.textItalic ? "italic" : "normal";
      const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
      cctx.fillStyle = layer.textColor || "#000000";
      cctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
      cctx.textBaseline = "top";
      cctx.textAlign = layer.textAlign || "left";
      const lines = layer.textContent.split("\n");
      const textX =
        layer.textAlign === "center"
          ? layer.width / 2
          : layer.textAlign === "right"
          ? layer.width
          : 0;
      lines.forEach((line, lineIdx) => {
        cctx.fillText(line, textX, lineIdx * lineHeight);
      });
    } else if (layerHasImage(layer)) {
      try {
        const imgUrl = getLayerImageDataUrl(layer);
        if (imgUrl) {
          const img = await loadImage(imgUrl);
          cctx.drawImage(img, 0, 0, layer.width, layer.height);
        }
      } catch {
        // Skip unloadable images
        ctx.restore();
        continue;
      }
    }

    // Apply adjustments
    if (hasActiveAdjustments(layer.adjustments)) {
      const adjData = cctx.getImageData(0, 0, layer.width, layer.height);
      applyAllAdjustments(adjData, layer.adjustments!);
      cctx.putImageData(adjData, 0, 0);
    }

    // Apply mask
    const maskUrl = getLayerMaskDataUrl(layer);
    if (hasMask && maskUrl) {
      try {
        const maskImg = await loadImage(maskUrl);
        const alphaMask = luminanceToAlpha(maskImg, layer.width, layer.height);
        cctx.globalCompositeOperation = "destination-in";
        cctx.drawImage(alphaMask, 0, 0, layer.width, layer.height);
      } catch {
        // Skip mask if unloadable
      }
    }

    ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
  }

  return canvas;
}

export interface FlattenLayersOptions {
  preferMainThread?: boolean;
}

/**
 * Main flattening API. Uses worker/offscreen processing for export and AI paths,
 * with safe fallback to the legacy main-thread implementation.
 */
export async function flattenLayers(
  layers: Layer[],
  docW: number,
  docH: number,
  options: FlattenLayersOptions = {},
): Promise<HTMLCanvasElement> {
  if (options.preferMainThread) {
    return flattenLayersMainThread(layers, docW, docH);
  }

  try {
    const workerLayers = layers.map(layerToWorkerLayer);
    const blob = await runImageWorker({
      type: "flatten",
      payload: { layers: workerLayers, docW, docH },
    });
    return await blobToCanvas(blob, docW, docH);
  } catch {
    return flattenLayersMainThread(layers, docW, docH);
  }
}

// ─── Extract Selection Region ─────────────────────────────────────────
/**
 * Flattens all visible layers, then crops to the selection rectangle.
 * Returns a base64 PNG data URL of just the selected region.
 */
export async function extractSelection(
  layers: Layer[],
  docW: number,
  docH: number,
  selection: Selection
): Promise<string> {
  const flattened = await flattenLayers(layers, docW, docH);
  
  const sx = Math.max(0, Math.round(selection.x));
  const sy = Math.max(0, Math.round(selection.y));
  const sw = Math.min(Math.round(selection.width), docW - sx);
  const sh = Math.min(Math.round(selection.height), docH - sy);

  const crop = document.createElement("canvas");
  crop.width = sw;
  crop.height = sh;
  const cctx = crop.getContext("2d")!;
  cctx.drawImage(flattened, sx, sy, sw, sh, 0, 0, sw, sh);

  return crop.toDataURL("image/png");
}

// ─── Extract Active Layer Image ───────────────────────────────────────
/**
 * Extracts just the active layer's content (with adjustments applied)
 * as a base64 PNG. Useful for sending a single layer to ComfyUI.
 */
export async function extractLayerImage(layer: Layer): Promise<string> {
  try {
    const workerLayer = layerToWorkerLayer(layer);
    const blob = await runImageWorker({
      type: "extract-layer",
      payload: { layer: workerLayer },
    });
    return await blobToDataUrl(blob);
  } catch {
    // Fallback to main-thread extraction below.
  }

  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  if (layer.type === "fill") {
    ctx.fillStyle = layer.fillColor || "#ffffff";
    ctx.fillRect(0, 0, layer.width, layer.height);
  } else if (layer.type === "text" && layer.textContent) {
    // Render text layer content
    const fontSize = layer.textSize || 32;
    const fontFamily = layer.textFont || "Inter";
    const weight = layer.textBold ? "bold" : "normal";
    const style = layer.textItalic ? "italic" : "normal";
    const lineHeight = (layer.textLineHeight || 1.4) * fontSize;
    ctx.fillStyle = layer.textColor || "#000000";
    ctx.font = `${style} ${weight} ${fontSize}px ${fontFamily}, sans-serif`;
    ctx.textBaseline = "top";
    ctx.textAlign = layer.textAlign || "left";
    const lines = layer.textContent.split("\n");
    const textX =
      layer.textAlign === "center"
        ? layer.width / 2
        : layer.textAlign === "right"
        ? layer.width
        : 0;
    lines.forEach((line, lineIdx) => {
      ctx.fillText(line, textX, lineIdx * lineHeight);
    });
  } else if (layerHasImage(layer)) {
    const imgUrl = getLayerImageDataUrl(layer);
    if (imgUrl) {
      const img = await loadImage(imgUrl);
      ctx.drawImage(img, 0, 0, layer.width, layer.height);
    }
  }

  if (hasActiveAdjustments(layer.adjustments)) {
    const adjData = ctx.getImageData(0, 0, layer.width, layer.height);
    applyAllAdjustments(adjData, layer.adjustments!);
    ctx.putImageData(adjData, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

// ─── Extract Mask as B/W Image ────────────────────────────────────────
/**
 * Extracts a layer's mask as a black/white PNG (for inpainting workflows).
 * White = keep, Black = replace. Returns base64 data URL.
 */
export async function extractMaskImage(layer: Layer): Promise<string | null> {
  const maskUrl = getLayerMaskDataUrl(layer);
  if (!maskUrl) return null;

  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const img = await loadImage(maskUrl);
  ctx.drawImage(img, 0, 0, layer.width, layer.height);

  return canvas.toDataURL("image/png");
}

// ─── Extract Inverted Mask (for inpainting) ───────────────────────────
/**
 * Some inpainting workflows expect inverted masks (white = inpaint area).
 * This inverts the mask and returns base64 PNG.
 */
export async function extractInvertedMask(layer: Layer): Promise<string | null> {
  const maskUrl = getLayerMaskDataUrl(layer);
  if (!maskUrl) return null;

  const canvas = document.createElement("canvas");
  canvas.width = layer.width;
  canvas.height = layer.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

  const img = await loadImage(maskUrl);
  ctx.drawImage(img, 0, 0, layer.width, layer.height);

  const data = ctx.getImageData(0, 0, layer.width, layer.height);
  const d = data.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(data, 0, 0);

  return canvas.toDataURL("image/png");
}

// ─── Data URL to Blob ─────────────────────────────────────────────────
export function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)?.[1] || "image/png";
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: mime });
}

// ─── Base64 string only (no data: prefix) ─────────────────────────────
export function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.split(",")[1] || "";
}

// ─── Blob URL to Data URL ─────────────────────────────────────────────
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
