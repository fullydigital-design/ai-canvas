import type { WorkerLayer } from "../image-processing-types";
import { renderLayerToCanvas } from "./layer-render";

export async function renderSingleLayerToBlob(layer: WorkerLayer): Promise<Blob> {
  const layerCanvas = await renderLayerToCanvas(layer, { applyMask: false });
  return layerCanvas.convertToBlob({ type: "image/png" });
}
