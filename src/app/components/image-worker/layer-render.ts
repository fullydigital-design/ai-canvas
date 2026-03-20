import type { WorkerLayer } from "../image-processing-types";
import { applyAllAdjustments, hasActiveAdjustments } from "./adjustments";
import {
  loadBitmap,
  luminanceToAlpha,
  renderTextContent,
} from "./shared";

export async function renderLayerToCanvas(
  layer: WorkerLayer,
  options: { applyMask?: boolean } = {},
): Promise<OffscreenCanvas> {
  const { applyMask = true } = options;

  const canvas = new OffscreenCanvas(layer.width, layer.height);
  const ctx = canvas.getContext("2d")!;

  if (layer.type === "fill") {
    ctx.fillStyle = layer.fillColor || "#ffffff";
    ctx.fillRect(0, 0, layer.width, layer.height);
  } else if (layer.type === "text" && layer.textContent) {
    renderTextContent(ctx, layer);
  } else if (layer.imageDataUrl) {
    const bitmap = await loadBitmap(layer.imageDataUrl);
    ctx.drawImage(bitmap, 0, 0, layer.width, layer.height);
  }

  if (hasActiveAdjustments(layer.adjustments)) {
    const adjData = ctx.getImageData(0, 0, layer.width, layer.height);
    applyAllAdjustments(adjData, layer.adjustments!);
    ctx.putImageData(adjData, 0, 0);
  }

  if (applyMask && layer.maskEnabled && layer.maskDataUrl) {
    const maskBitmap = await loadBitmap(layer.maskDataUrl);
    const maskCanvas = new OffscreenCanvas(layer.width, layer.height);
    const mctx = maskCanvas.getContext("2d")!;
    mctx.drawImage(maskBitmap, 0, 0, layer.width, layer.height);
    const alphaMask = luminanceToAlpha(mctx, layer.width, layer.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(alphaMask, 0, 0, layer.width, layer.height);
  }

  return canvas;
}
