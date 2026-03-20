import type { ImageWorkerRequest } from "./image-processing-types";
import { processImageWorkerRequest } from "./image-worker/protocol";

// Thin worker entrypoint: delegate request handling to protocol module.
self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const response = await processImageWorkerRequest(event.data);
  self.postMessage(response);
};
