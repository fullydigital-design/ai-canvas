/**
 * SAM (Segment Anything Model) Integration — uses ComfyUI SAM nodes
 * to generate smart masks from point prompts or bounding boxes.
 * Supports both SAM1 and SAM2 node setups.
 */
import { useState, useCallback } from "react";
import {
  LoaderCircle,
  WandSparkles,
  X,
  Plus,
  Eye,
} from "lucide-react";
import { useEditorSelector, type Layer } from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";
import { getComfyClient } from "./comfyui-client";
import { extractLayerImage } from "./canvas-utils";
import { useShallow } from "zustand/react/shallow";

// SAM point prompt
interface SAMPoint {
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  label: 0 | 1; // 0 = background, 1 = foreground
}

// SAM bounding box
interface SAMBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type SAMMode = "points" | "box";

interface SAMIntegrationProps {
  open: boolean;
  onClose: () => void;
}

// ─── Build ComfyUI workflow for SAM segmentation ─────────────────────
function buildSAMWorkflow(
  points: SAMPoint[],
  box: SAMBox | null,
  modelName: string,
  useBox: boolean,
): Record<string, unknown> {
  // This workflow uses the common ComfyUI-SAM node setup:
  // 1. LoadImage -> SAMModelLoader -> SAMPredictor -> mask output
  const workflow: Record<string, unknown> = {
    // Load input image
    "1": {
      class_type: "LoadImage",
      inputs: { image: "sam_input.png", upload: "image" },
    },
    // Load SAM model
    "2": {
      class_type: "SAMModelLoader (Inspire)",
      inputs: { model_name: modelName },
    },
    // Run SAM prediction
    "3": {
      class_type: "SAMDetectorCombined",
      inputs: {
        sam_model: ["2", 0],
        image: ["1", 0],
        detection_hint: useBox ? "center-1" : "center-1",
        dilation: 0,
        threshold: 0.93,
        bbox_expansion: 0,
        mask_hint_threshold: 0.7,
        mask_hint_use_negative: "False",
      },
    },
    // Convert mask to image for output
    "4": {
      class_type: "MaskToImage",
      inputs: { mask: ["3", 0] },
    },
    // Save the mask image
    "5": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "sam_mask", images: ["4", 0] },
    },
  };

  // Add point prompts if provided
  if (points.length > 0) {
    // Some SAM implementations accept points as separate nodes
    // For the basic setup we configure detection_hint
    const hint = points.length === 1 ? "center-1" : `center-${points.length}`;
    (workflow["3"] as any).inputs.detection_hint = hint;
  }

  return workflow;
}

// ─── Simpler workflow: GroundingDINO + SAM (text-based segmentation) ──
function buildTextSAMWorkflow(
  textPrompt: string,
  modelName: string,
): Record<string, unknown> {
  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: "sam_input.png", upload: "image" },
    },
    "2": {
      class_type: "SAMModelLoader (Inspire)",
      inputs: { model_name: modelName },
    },
    "3": {
      class_type: "GroundingDinoModelLoader (segment anything)",
      inputs: { model_name: "GroundingDINO_SwinT_OGC (694MB)" },
    },
    "4": {
      class_type: "GroundingDinoSAMSegment (segment anything)",
      inputs: {
        grounding_dino_model: ["3", 0],
        sam_model: ["2", 0],
        image: ["1", 0],
        prompt: textPrompt,
        threshold: 0.3,
      },
    },
    "5": {
      class_type: "MaskToImage",
      inputs: { mask: ["4", 1] },
    },
    "6": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "sam_mask", images: ["5", 0] },
    },
  };
}

// ─── Auto workflow: SAM Everything (segments all objects) ──────────────
function buildAutoSAMWorkflow(
  modelName: string,
  threshold: number,
): Record<string, unknown> {
  // Uses the ComfyUI-Inspire SAMDetectorCombined in "everything" mode
  // which segments the most prominent subject without a text prompt.
  return {
    "1": {
      class_type: "LoadImage",
      inputs: { image: "sam_input.png", upload: "image" },
    },
    "2": {
      class_type: "SAMModelLoader (Inspire)",
      inputs: { model_name: modelName },
    },
    "3": {
      class_type: "SAMDetectorCombined",
      inputs: {
        sam_model: ["2", 0],
        image: ["1", 0],
        detection_hint: "center-1",   // auto-detect main subject
        dilation: 0,
        threshold: threshold,
        bbox_expansion: 0,
        mask_hint_threshold: 0.7,
        mask_hint_use_negative: "False",
      },
    },
    "4": {
      class_type: "MaskToImage",
      inputs: { mask: ["3", 0] },
    },
    "5": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "sam_auto", images: ["4", 0] },
    },
  };
}

export function SAMIntegration({ open, onClose }: SAMIntegrationProps) {
  const {
    layers,
    activeLayerId,
    comfyuiUrl,
    canvasWidth,
    canvasHeight,
    addLayer,
    updateLayer,
  } = useEditorSelector(
    useShallow((s) => ({
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      comfyuiUrl: s.comfyuiUrl,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
      addLayer: s.addLayer,
      updateLayer: s.updateLayer,
    }))
  );

  const [mode, setMode] = useState<"auto" | "text">("text");
  const [textPrompt, setTextPrompt] = useState("");
  const [samModel, setSamModel] = useState("sam_vit_b_01ec64.pth");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState("");
  const [resultMask, setResultMask] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.3);

  const activeLayer = layers.find((l) => l.id === activeLayerId);

  const handleRunSAM = useCallback(async () => {
    if (!activeLayer) {
      setError("No active layer selected");
      return;
    }

    if (mode === "text" && !textPrompt.trim()) {
      setError("Enter a text prompt describing what to segment");
      return;
    }

    setLoading(true);
    setError(null);
    setProgressText("Extracting image...");

    try {
      const client = getComfyClient(comfyuiUrl);

      // Extract image from active layer
      const imageData = await extractLayerImage(activeLayer);
      if (!imageData) throw new Error("Could not extract image from layer");

      // Upload image
      setProgressText("Uploading to ComfyUI...");
      const res = await fetch(imageData);
      const blob = await res.blob();
      const uploadResult = await client.uploadImage(blob, "sam_input.png");

      // Build workflow
      setProgressText("Running SAM segmentation...");
      let workflow: Record<string, unknown>;

      if (mode === "text") {
        workflow = buildTextSAMWorkflow(textPrompt, samModel);
        // Update threshold
        if (workflow["4"]) {
          (workflow["4"] as any).inputs.threshold = threshold;
        }
      } else {
        workflow = buildAutoSAMWorkflow(samModel, threshold);
      }

      // Update input image name
      if (workflow["1"]) {
        (workflow["1"] as any).inputs.image = uploadResult.name;
      }

      // Run workflow
      const resultImages = await client.runWorkflow(workflow, (event) => {
        if (event.type === "progress") {
          const d = event.data as any;
          if (d.max > 0) {
            setProgressText(
              `Segmenting... ${Math.round((d.value / d.max) * 100)}%`
            );
          }
        }
      });

      if (resultImages.length === 0) {
        throw new Error("No mask output from SAM");
      }

      setResultMask(resultImages[0]);
      setProgressText("Segmentation complete!");
    } catch (err: any) {
      setError(err.message || "SAM segmentation failed");
      setProgressText("");
    }
    setLoading(false);
  }, [activeLayer, mode, textPrompt, samModel, threshold, comfyuiUrl, canvasWidth, canvasHeight]);

  const handleApplyAsMask = useCallback(() => {
    if (!resultMask || !activeLayerId) return;

    // Apply the SAM result as a mask on the active layer via cache
    const maskRef = generateImageRef();
    globalImageCache.putSync(resultMask, maskRef);
    updateLayer(activeLayerId, {
      maskRef: maskRef,
      maskEnabled: true,
    });
    setProgressText("Mask applied to active layer!");
  }, [resultMask, activeLayerId, updateLayer]);

  const handleApplyAsLayer = useCallback(() => {
    if (!resultMask) return;

    const layerRef = generateImageRef();
    globalImageCache.putSync(resultMask, layerRef);
    const newLayer: Layer = {
      id: `sam-mask-${Date.now()}`,
      name: `SAM: ${textPrompt || "auto"}`,
      visible: true,
      locked: false,
      opacity: 100,
      type: "ai-generated",
      imageRef: layerRef,
      blendMode: "normal",
      x: activeLayer?.x ?? 0,
      y: activeLayer?.y ?? 0,
      width: activeLayer?.width ?? canvasWidth,
      height: activeLayer?.height ?? canvasHeight,
    };
    addLayer(newLayer);
    setProgressText("Mask added as new layer!");
  }, [resultMask, textPrompt, activeLayer, canvasWidth, canvasHeight, addLayer]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[440px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <WandSparkles className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">
              SAM Smart Selection
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Mode selector */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setMode("text")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs transition-colors ${
                mode === "text"
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground border border-border hover:bg-accent/30"
              }`}
            >
              <WandSparkles className="w-3 h-3" />
              Text Prompt
            </button>
            <button
              onClick={() => setMode("auto")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-xs transition-colors ${
                mode === "auto"
                  ? "bg-primary/10 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground border border-border hover:bg-accent/30"
              }`}
            >
              <Eye className="w-3 h-3" />
              Auto Detect
            </button>
          </div>

          {/* Active layer info */}
          <div className="bg-secondary/50 rounded-md p-2 text-xs">
            <span className="text-muted-foreground">Active layer: </span>
            {activeLayer ? (
              <span className="text-foreground">{activeLayer.name}</span>
            ) : (
              <span className="text-destructive">None selected</span>
            )}
          </div>

          {/* Text prompt */}
          {mode === "text" && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                What to segment
              </label>
              <input
                value={textPrompt}
                onChange={(e) => setTextPrompt(e.target.value)}
                placeholder="e.g. person, car, dog, building..."
                className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
              />
              <div className="text-[10px] text-muted-foreground mt-1">
                Uses GroundingDINO + SAM for text-guided segmentation
              </div>
            </div>
          )}

          {mode === "auto" && (
            <div className="text-xs text-muted-foreground bg-secondary/30 rounded-md p-2">
              Auto mode runs SAM to detect the main subject in the image.
              For best results, crop the image to focus on the subject first.
            </div>
          )}

          {/* SAM Model */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              SAM Model
            </label>
            <select
              value={samModel}
              onChange={(e) => setSamModel(e.target.value)}
              className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border"
            >
              <option value="sam_vit_b_01ec64.pth">SAM ViT-B (375MB)</option>
              <option value="sam_vit_l_0b3195.pth">SAM ViT-L (1.2GB)</option>
              <option value="sam_vit_h_4b8939.pth">SAM ViT-H (2.6GB)</option>
              <option value="sam_hq_vit_b.pth">SAM-HQ ViT-B</option>
              <option value="sam_hq_vit_h.pth">SAM-HQ ViT-H</option>
              <option value="mobile_sam.pt">MobileSAM (fast)</option>
            </select>
          </div>

          {/* Threshold */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-16">
              Threshold
            </label>
            <input
              type="range"
              min={0.1}
              max={0.9}
              step={0.05}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="flex-1 accent-primary h-1"
            />
            <span className="text-xs text-muted-foreground w-8 text-right">
              {threshold.toFixed(2)}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Progress */}
          {(loading || progressText) && (
            <div className="bg-primary/5 border border-primary/15 rounded-md p-2 flex items-center gap-2 text-xs text-primary">
              {loading && <LoaderCircle className="w-3 h-3 animate-spin" />}
              <span>{progressText || "Processing..."}</span>
            </div>
          )}

          {/* Result preview */}
          {resultMask && (
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Result:</div>
              <div className="relative rounded-md overflow-hidden border border-border bg-[repeating-conic-gradient(#808080_0%_25%,transparent_0%_50%)] bg-[length:16px_16px]">
                <img
                  src={resultMask}
                  alt="SAM mask result"
                  className="w-full h-auto max-h-48 object-contain"
                />
              </div>

              <div className="flex gap-1.5">
                <button
                  onClick={handleApplyAsMask}
                  disabled={!activeLayerId}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  <Eye className="w-3 h-3" />
                  Apply as Mask
                </button>
                <button
                  onClick={handleApplyAsLayer}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-secondary text-foreground rounded-md text-xs hover:bg-accent border border-border transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add as Layer
                </button>
              </div>
            </div>
          )}

          {/* Run button */}
          <button
            onClick={handleRunSAM}
            disabled={loading || !activeLayer || (mode === "text" && !textPrompt.trim())}
            className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-md text-xs hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <>
                <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                Segmenting...
              </>
            ) : (
              <>
                <WandSparkles className="w-3.5 h-3.5" />
                Run Segmentation
              </>
            )}
          </button>

          {/* Info */}
          <div className="text-[10px] text-muted-foreground space-y-1">
            <div>
              <strong>Requirements:</strong> ComfyUI with segment_anything nodes installed
              (ComfyUI-Inspire-Pack or comfyui_segment_anything).
            </div>
            <div>
              SAM model files go in{" "}
              <code className="bg-secondary px-1 rounded">ComfyUI/models/sams/</code>
            </div>
            <div>
              GroundingDINO models go in{" "}
              <code className="bg-secondary px-1 rounded">ComfyUI/models/grounding-dino/</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
