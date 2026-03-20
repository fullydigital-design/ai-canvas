import type {
  ImageWorkerRequest,
  ImageWorkerResponse,
} from "../image-processing-types";
import { renderSingleLayerToBlob } from "./extract-layer";
import { flattenToBlob } from "./flatten";

export async function processImageWorkerRequest(
  req: ImageWorkerRequest,
): Promise<ImageWorkerResponse> {
  try {
    if (req.type === "flatten") {
      const blob = await flattenToBlob(
        req.payload.layers,
        req.payload.docW,
        req.payload.docH,
      );
      return { id: req.id, ok: true, blob };
    }

    const blob = await renderSingleLayerToBlob(req.payload.layer);
    return { id: req.id, ok: true, blob };
  } catch (error) {
    return {
      id: req.id,
      ok: false,
      error: error instanceof Error ? error.message : "Worker processing failed",
    };
  }
}
