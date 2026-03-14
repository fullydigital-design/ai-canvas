/**
 * Batch Processor — run a ComfyUI workflow on multiple layers simultaneously.
 * Queues each layer as an independent job, tracks progress per-item, and
 * places results as new layers.
 */
import { useState, useRef } from "react";
import {
  LoaderCircle,
  Play,
  Layers,
  CircleCheck,
  CircleX,
  CircleAlert,
  X,
  Pause,
} from "lucide-react";
import { useEditor, type Layer } from "./editor-store";
import { type ComfyWorkflowData } from "./comfyui-workflow-modal";
import { getComfyClient, type ComfyProgressEvent } from "./comfyui-client";
import { extractLayerImage } from "./canvas-utils";

interface BatchJob {
  layerId: string;
  layerName: string;
  status: "pending" | "uploading" | "running" | "done" | "error";
  progress: number; // 0-100
  error?: string;
  resultLayerId?: string;
}

interface BatchProcessorProps {
  open: boolean;
  onClose: () => void;
  workflow: ComfyWorkflowData | null;
  inputNodeId: string | null;
}

export function BatchProcessor({
  open,
  onClose,
  workflow,
  inputNodeId,
}: BatchProcessorProps) {
  const {
    layers,
    addLayer,
    comfyuiUrl,
    canvasWidth,
    canvasHeight,
    selection,
  } = useEditor();

  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<BatchJob[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  // useRef so the async loop can read the live cancelled value (state closure is stale)
  const cancelledRef = useRef(false);

  if (!open) return null;

  const imageLayers = layers.filter(
    (l) => l.type === "image" || l.type === "ai-generated"
  );

  const toggleLayer = (id: string) => {
    setSelectedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedLayerIds(new Set(imageLayers.map((l) => l.id)));
  };

  const selectNone = () => {
    setSelectedLayerIds(new Set());
  };

  const handleRun = async () => {
    if (!workflow || !inputNodeId || selectedLayerIds.size === 0) return;

    setIsRunning(true);
    setCancelled(false);
    cancelledRef.current = false;

    const initialJobs: BatchJob[] = Array.from(selectedLayerIds).map((id) => ({
      layerId: id,
      layerName: layers.find((l) => l.id === id)?.name || "Unknown",
      status: "pending",
      progress: 0,
    }));
    setJobs(initialJobs);

    const client = getComfyClient(comfyuiUrl);

    for (let i = 0; i < initialJobs.length; i++) {
      if (cancelledRef.current) break;

      const job = initialJobs[i];
      const layer = layers.find((l) => l.id === job.layerId);
      if (!layer) continue;

      // Update status: uploading
      setJobs((prev) =>
        prev.map((j, idx) => (idx === i ? { ...j, status: "uploading" } : j))
      );

      try {
        // Extract image from layer
        const imageData = await extractLayerImage(layer);
        if (!imageData) throw new Error("Could not extract image from layer");

        // Convert data URL to blob
        const res = await fetch(imageData);
        const blob = await res.blob();

        // Upload
        const uploadResult = await client.uploadImage(
          blob,
          `batch_input_${i}.png`
        );

        // Patch workflow JSON with uploaded image
        const modifiedJson = JSON.parse(JSON.stringify(workflow.rawJson));
        if (modifiedJson[inputNodeId]?.inputs) {
          modifiedJson[inputNodeId].inputs.image = uploadResult.name;
        }

        // Apply exposed param values
        for (const param of workflow.exposedParams) {
          if (modifiedJson[param.nodeId]?.inputs) {
            modifiedJson[param.nodeId].inputs[param.fieldName] = param.value;
          }
        }

        // Update status: running
        setJobs((prev) =>
          prev.map((j, idx) => (idx === i ? { ...j, status: "running" } : j))
        );

        // Run workflow
        const resultImages = await client.runWorkflow(
          modifiedJson,
          (event: ComfyProgressEvent) => {
            if (event.type === "progress") {
              const d = event.data as any;
              const pct = d.max > 0 ? Math.round((d.value / d.max) * 100) : 0;
              setJobs((prev) =>
                prev.map((j, idx) =>
                  idx === i ? { ...j, progress: pct } : j
                )
              );
            }
          }
        );

        if (resultImages.length > 0) {
          // Create new layer with result
          const img = new Image();
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            img.src = resultImages[0];
          });

          const newLayer: Layer = {
            id: `batch-${Date.now()}-${i}`,
            name: `Batch: ${layer.name}`,
            visible: true,
            locked: false,
            opacity: 100,
            type: "ai-generated",
            imageData: resultImages[0],
            blendMode: "normal",
            x: layer.x,
            y: layer.y,
            width: img.width || layer.width,
            height: img.height || layer.height,
          };
          addLayer(newLayer);

          setJobs((prev) =>
            prev.map((j, idx) =>
              idx === i
                ? { ...j, status: "done", progress: 100, resultLayerId: newLayer.id }
                : j
            )
          );
        } else {
          throw new Error("No output images");
        }
      } catch (err: any) {
        setJobs((prev) =>
          prev.map((j, idx) =>
            idx === i
              ? { ...j, status: "error", error: err.message || "Failed" }
              : j
          )
        );
      }
    }

    setIsRunning(false);
  };

  const completedCount = jobs.filter((j) => j.status === "done").length;
  const errorCount = jobs.filter((j) => j.status === "error").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Batch Processor</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Workflow info */}
        <div className="px-4 py-2 border-b border-border bg-secondary/30">
          {workflow ? (
            <div className="text-xs">
              <span className="text-muted-foreground">Workflow: </span>
              <span className="text-foreground">{workflow.name}</span>
              {!inputNodeId && (
                <span className="text-destructive ml-2">
                  (No input node mapped)
                </span>
              )}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              No workflow selected. Select a workflow or preset in the ComfyUI tab first.
            </div>
          )}
        </div>

        {/* Layer selection */}
        {!isRunning && jobs.length === 0 && (
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                Select layers to process ({imageLayers.length} available)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={selectAll}
                  className="text-[10px] text-primary hover:underline"
                >
                  All
                </button>
                <button
                  onClick={selectNone}
                  className="text-[10px] text-muted-foreground hover:underline"
                >
                  None
                </button>
              </div>
            </div>

            {imageLayers.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted-foreground">
                No image layers found. Import or generate images first.
              </div>
            ) : (
              <div className="space-y-1">
                {imageLayers.map((layer) => (
                  <label
                    key={layer.id}
                    className={`flex items-center gap-2 px-2.5 py-2 rounded-md border cursor-pointer transition-colors ${
                      selectedLayerIds.has(layer.id)
                        ? "border-primary/40 bg-primary/5"
                        : "border-border hover:bg-accent/20"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLayerIds.has(layer.id)}
                      onChange={() => toggleLayer(layer.id)}
                      className="accent-primary w-3.5 h-3.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-foreground truncate">
                        {layer.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {layer.width} x {layer.height} — {layer.type}
                      </div>
                    </div>
                    {/* Thumbnail */}
                    {layer.imageData && (
                      <img
                        src={layer.imageData}
                        alt=""
                        className="w-8 h-8 rounded object-cover border border-border"
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Progress view */}
        {(isRunning || jobs.length > 0) && (
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {jobs.map((job, idx) => (
              <div
                key={job.layerId}
                className="flex items-center gap-2 px-2.5 py-2 rounded-md border border-border bg-secondary/20"
              >
                {/* Status icon */}
                {job.status === "pending" && (
                  <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                {job.status === "uploading" && (
                  <LoaderCircle className="w-4 h-4 text-primary animate-spin" />
                )}
                {job.status === "running" && (
                  <LoaderCircle className="w-4 h-4 text-primary animate-spin" />
                )}
                {job.status === "done" && (
                  <CircleCheck className="w-4 h-4 text-primary" />
                )}
                {job.status === "error" && (
                  <CircleX className="w-4 h-4 text-destructive" />
                )}

                <div className="flex-1 min-w-0">
                  <div className="text-xs text-foreground truncate">
                    {job.layerName}
                  </div>
                  {job.status === "running" && (
                    <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden mt-1">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-300"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  {job.status === "error" && (
                    <div className="text-[10px] text-destructive truncate">
                      {job.error}
                    </div>
                  )}
                </div>

                <span className="text-[10px] text-muted-foreground shrink-0">
                  {job.status === "running"
                    ? `${job.progress}%`
                    : job.status === "done"
                    ? "Done"
                    : job.status === "error"
                    ? "Error"
                    : job.status === "uploading"
                    ? "Upload..."
                    : `#${idx + 1}`}
                </span>
              </div>
            ))}

            {!isRunning && jobs.length > 0 && (
              <div className="text-center pt-2 text-xs text-muted-foreground">
                Complete: {completedCount}/{jobs.length}
                {errorCount > 0 && (
                  <span className="text-destructive ml-2">
                    ({errorCount} errors)
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2">
          {!isRunning && jobs.length === 0 && (
            <>
              <span className="text-[10px] text-muted-foreground">
                {selectedLayerIds.size} layer(s) selected
              </span>
              <button
                onClick={handleRun}
                disabled={
                  !workflow ||
                  !inputNodeId ||
                  selectedLayerIds.size === 0
                }
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Play className="w-3 h-3" />
                Run Batch
              </button>
            </>
          )}

          {isRunning && (
            <button
              onClick={() => { setCancelled(true); cancelledRef.current = true; }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-destructive/10 text-destructive rounded-md text-xs hover:bg-destructive/20 transition-colors ml-auto"
            >
              <Pause className="w-3 h-3" />
              Cancel
            </button>
          )}

          {!isRunning && jobs.length > 0 && (
            <button
              onClick={() => {
                setJobs([]);
                setSelectedLayerIds(new Set());
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary text-foreground rounded-md text-xs hover:bg-accent transition-colors ml-auto"
            >
              New Batch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}