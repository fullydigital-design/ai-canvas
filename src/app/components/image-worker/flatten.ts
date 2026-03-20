import type { WorkerLayer } from "../image-processing-types";
import { renderLayerToCanvas } from "./layer-render";

export async function flattenToBlob(
  layers: WorkerLayer[],
  docW: number,
  docH: number,
): Promise<Blob> {
  const canvas = new OffscreenCanvas(docW, docH);
  const ctx = canvas.getContext("2d")!;
  const ordered = [...layers].reverse();

  for (const layer of ordered) {
    if (!layer.visible) continue;

    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.globalCompositeOperation =
      layer.blendMode === "normal"
        ? "source-over"
        : (layer.blendMode as GlobalCompositeOperation);

    const comp = await renderLayerToCanvas(layer);
    ctx.drawImage(comp, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
  }

  return canvas.convertToBlob({ type: "image/png" });
}
