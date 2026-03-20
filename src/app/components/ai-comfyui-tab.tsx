/**
 * ComfyUI Tab — workflow management, I/O mapping, and execution.
 * Extracted from ai-panel.tsx for modularity.
 */
import { useState, Suspense, lazy } from "react";
import { createWorkflowFromPreset, WORKFLOW_PRESETS } from "./workflow-presets";
import {
  LoaderCircle,
  WandSparkles,
  Server,
  ChevronRight,
  Upload,
  Download,
  FileJson,
  SlidersHorizontal,
  Maximize2,
  Trash2,
  Play,
  Square,
  Package,
  Layers,
} from "lucide-react";
import { useEditor, useEditorSelector, type Layer, layerHasMask } from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";
import type { ComfyWorkflowData } from "./comfyui-workflow-modal";
import { getComfyClient, type ComfyProgressEvent } from "./comfyui-client";
import {
  extractSelection,
  extractLayerImage,
  extractMaskImage,
  flattenLayers,
} from "./canvas-utils";
import { ConnectPanel } from "./comfyui-connect-panel";
import { useShallow } from "zustand/react/shallow";

const ComfyWorkflowModal = lazy(() =>
  import("./comfyui-workflow-modal").then((m) => ({ default: m.ComfyWorkflowModal }))
);
const ModelManager = lazy(() =>
  import("./model-manager").then((m) => ({ default: m.ModelManager }))
);
const BatchProcessor = lazy(() =>
  import("./batch-processor").then((m) => ({ default: m.BatchProcessor }))
);
const SAMIntegration = lazy(() =>
  import("./sam-integration").then((m) => ({ default: m.SAMIntegration }))
);

// ─── I/O Mapping Types ──────────────────────────────────────────────
interface IOMapping {
  inputNodeId: string | null;
  inputSource: "selection" | "active-layer" | "flatten";
  outputNodeId: string | null;
  maskNodeId: string | null;
}

export interface ComfyUITabProps {
  comfyConnected: boolean;
  setComfyConnected: (v: boolean) => void;
  comfyError: string | null;
  setComfyError: (v: string | null) => void;
  progressText: string;
  setProgressText: (v: string) => void;
  progressPercent: number;
  setProgressPercent: (v: number) => void;
  showSetupGuide: boolean;
  setShowSetupGuide: (v: boolean) => void;
  handleTestComfyUI: () => void;
}

export function ComfyUITab({
  comfyConnected,
  comfyError,
  setComfyError,
  progressText,
  setProgressText,
  progressPercent,
  setProgressPercent,
  showSetupGuide,
  setShowSetupGuide,
  handleTestComfyUI,
}: ComfyUITabProps) {
  const {
    comfyuiUrl,
    isGenerating,
    setIsGenerating,
    selection,
    addLayer,
    layers,
    activeLayerId,
    canvasWidth,
    canvasHeight,
  } = useEditorSelector(
    useShallow((s) => ({
      comfyuiUrl: s.comfyuiUrl,
      isGenerating: s.isGenerating,
      setIsGenerating: s.setIsGenerating,
      selection: s.selection,
      addLayer: s.addLayer,
      layers: s.layers,
      activeLayerId: s.activeLayerId,
      canvasWidth: s.canvasWidth,
      canvasHeight: s.canvasHeight,
    }))
  );

  // ComfyUI workflow state
  const [workflows, setWorkflows] = useState<ComfyWorkflowData[]>([]);
  const [activeWorkflow, setActiveWorkflow] = useState<ComfyWorkflowData | null>(null);
  const [showWorkflowModal, setShowWorkflowModal] = useState(false);

  // I/O mapping for active workflow
  const [ioMapping, setIOMapping] = useState<IOMapping>({
    inputNodeId: null,
    inputSource: "selection",
    outputNodeId: null,
    maskNodeId: null,
  });

  // Modal states
  const [showModelManager, setShowModelManager] = useState(false);
  const [showBatchProcessor, setShowBatchProcessor] = useState(false);
  const [showSAM, setShowSAM] = useState(false);

  // ─── ComfyUI Workflow Run ─────────────────────────────────

  const handleRunComfyWorkflow = async (
    wf: ComfyWorkflowData,
    values: Record<string, unknown>
  ) => {
    setIsGenerating(true);
    setComfyError(null);
    setProgressText("Preparing workflow...");
    setProgressPercent(0);

    try {
      const client = getComfyClient(comfyuiUrl);
      let modifiedJson = JSON.parse(JSON.stringify(wf.rawJson));
      for (const param of wf.exposedParams) {
        const key = `${param.nodeId}.${param.fieldName}`;
        const val = values[key] ?? param.value;
        if (modifiedJson[param.nodeId]?.inputs) {
          modifiedJson[param.nodeId].inputs[param.fieldName] = val;
        }
      }

      // Upload canvas image to input node
      if (ioMapping.inputNodeId && modifiedJson[ioMapping.inputNodeId]) {
        setProgressText("Uploading canvas input...");
        let inputDataUrl: string;
        if (ioMapping.inputSource === "selection" && selection) {
          inputDataUrl = await extractSelection(layers, canvasWidth, canvasHeight, selection);
        } else if (ioMapping.inputSource === "active-layer" && activeLayerId) {
          const activeLayer = layers.find((l) => l.id === activeLayerId);
          if (activeLayer) {
            inputDataUrl = await extractLayerImage(activeLayer);
          } else {
            throw new Error("No active layer found");
          }
        } else {
          const flattened = await flattenLayers(layers, canvasWidth, canvasHeight);
          inputDataUrl = flattened.toDataURL("image/png");
        }
        modifiedJson = await client.uploadAndSetImage(
          modifiedJson, ioMapping.inputNodeId, inputDataUrl, `canvas_input_${Date.now()}.png`
        );
      }

      // Upload mask if mapped
      if (ioMapping.maskNodeId && modifiedJson[ioMapping.maskNodeId]) {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer && layerHasMask(activeLayer)) {
          setProgressText("Uploading mask...");
          const maskDataUrl = await extractMaskImage(activeLayer);
          if (maskDataUrl) {
            modifiedJson = await client.uploadAndSetImage(
              modifiedJson, ioMapping.maskNodeId, maskDataUrl, `canvas_mask_${Date.now()}.png`
            );
          }
        }
      }

      // Run the workflow
      setProgressText("Queueing workflow...");
      const onProgress = (event: ComfyProgressEvent) => {
        if (event.type === "progress") {
          const d = event.data as any;
          const pct = d.value && d.max ? Math.round((d.value / d.max) * 100) : 0;
          setProgressPercent(pct);
          setProgressText(`Processing: ${pct}% (step ${d.value}/${d.max})`);
        } else if (event.type === "executing") {
          const nodeId = (event.data as any)?.node;
          if (nodeId) {
            const node = wf.nodes.find((n) => n.id === nodeId);
            setProgressText(`Executing: ${node?.class_type || `Node #${nodeId}`}`);
          }
        } else if (event.type === "execution_start") {
          setProgressText("Execution started...");
        }
      };

      const resultImages = await client.runWorkflow(modifiedJson, onProgress);
      if (resultImages.length === 0) throw new Error("No output images received from ComfyUI");

      for (let i = 0; i < resultImages.length; i++) {
        const dataUrl = resultImages[i];
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = dataUrl;
        });
        const ref = generateImageRef();
        globalImageCache.putSync(dataUrl, ref);
        const newLayer: Layer = {
          id: `comfy-${Date.now()}-${i}`,
          name: `ComfyUI: ${wf.name.slice(0, 15)}${resultImages.length > 1 ? ` #${i + 1}` : ""}`,
          visible: true, locked: false, opacity: 100, type: "ai-generated",
          imageRef: ref, blendMode: "normal",
          x: selection?.x ?? Math.round((canvasWidth - img.width) / 2),
          y: selection?.y ?? Math.round((canvasHeight - img.height) / 2),
          width: selection?.width || img.width || 512,
          height: selection?.height || img.height || 512,
        };
        addLayer(newLayer);
      }
      setProgressText(`Done! ${resultImages.length} image(s) generated.`);
      setProgressPercent(100);
    } catch (err: any) {
      setComfyError(err.message || "Workflow execution failed");
      setProgressText("");
      setProgressPercent(0);
    }
    setIsGenerating(false);
  };

  // ─── Workflow Management ────────────────────────────────────

  const handleSetWorkflow = (wf: ComfyWorkflowData) => {
    setActiveWorkflow(wf);
    setWorkflows((prev) => {
      const idx = prev.findIndex((w) => w.id === wf.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = wf; return next; }
      return [...prev, wf];
    });
    const loadImageNodes = wf.nodes.filter((n) => n.class_type === "LoadImage");
    const saveImageNodes = wf.nodes.filter(
      (n) => n.class_type === "SaveImage" || n.class_type === "PreviewImage"
    );
    setIOMapping((prev) => ({
      ...prev,
      inputNodeId: loadImageNodes[0]?.id || null,
      outputNodeId: saveImageNodes[0]?.id || null,
      maskNodeId: loadImageNodes.length > 1 ? loadImageNodes[1]?.id : null,
    }));
  };

  const handleDeleteWorkflow = (id: string) => {
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
    if (activeWorkflow?.id === id) setActiveWorkflow(null);
  };

  const getLoadImageNodes = () =>
    activeWorkflow?.nodes.filter((n) => n.class_type === "LoadImage") || [];
  const getSaveImageNodes = () =>
    activeWorkflow?.nodes.filter(
      (n) => n.class_type === "SaveImage" || n.class_type === "PreviewImage"
    ) || [];

  return (
    <>
      <div className="space-y-3">
        {/* Connection status */}
        <div className="flex items-center gap-2 text-xs">
          <div className={`w-2 h-2 rounded-full ${comfyConnected ? "bg-primary" : "bg-muted-foreground"}`} />
          <span className={comfyConnected ? "text-primary" : "text-muted-foreground"}>
            {comfyConnected ? "Connected" : "Not connected"}
          </span>
          <button
            onClick={handleTestComfyUI}
            disabled={isGenerating}
            className="ml-auto text-xs text-primary hover:underline disabled:opacity-50"
          >
            {comfyConnected ? "Reconnect" : "Connect"}
          </button>
        </div>

        {/* ComfyUI URL quick access when not connected */}
        {!comfyConnected && (
          <div className="bg-secondary/50 rounded-md p-2 space-y-1.5">
            <label className="text-[10px] text-muted-foreground uppercase tracking-wider block">
              ComfyUI URL
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={comfyuiUrl}
                onChange={(e) => useEditor.getState().setComfyuiUrl(e.target.value)}
                className="flex-1 bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                placeholder="http://localhost:8188"
              />
              <button
                onClick={handleTestComfyUI}
                disabled={isGenerating}
                className="px-2 py-1 bg-primary text-primary-foreground text-xs rounded-md transition-colors disabled:opacity-50"
              >
                Connect
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground/70">
              Requires <code className="bg-secondary px-1 rounded">--enable-cors-header</code> flag.
              Use the Setup Guide below ↓
            </p>
          </div>
        )}

        {/* Import workflow button */}
        <button
          onClick={() => { setActiveWorkflow(null); setShowWorkflowModal(true); }}
          className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-accent border border-border border-dashed py-3 rounded-md transition-colors text-xs text-muted-foreground hover:text-foreground"
        >
          <Upload className="w-3.5 h-3.5" />
          Import Workflow JSON
        </button>

        {/* Workflow Presets */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Presets</div>
          <div className="grid grid-cols-2 gap-1.5">
            {WORKFLOW_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => {
                  const wfClone: ComfyWorkflowData = createWorkflowFromPreset(preset);
                  handleSetWorkflow(wfClone);
                  setIOMapping({
                    inputNodeId: preset.inputNodeId,
                    inputSource: preset.maskRequired ? "active-layer" : "selection",
                    outputNodeId: null,
                    maskNodeId: preset.maskNodeId,
                  });
                }}
                className={`flex flex-col items-center gap-1 p-2 rounded-md border transition-colors text-xs ${
                  activeWorkflow?.name === preset.workflow.name
                    ? "border-primary/40 bg-primary/5 text-primary"
                    : "border-border hover:bg-accent/30 text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="text-base">{preset.icon}</span>
                <span className="text-[10px] text-center leading-tight">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>


        {/* Loaded workflows */}
        {workflows.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Workflows ({workflows.length})
            </div>
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`border rounded-md p-2 transition-colors cursor-pointer ${
                  activeWorkflow?.id === wf.id
                    ? "border-primary/40 bg-primary/5"
                    : "border-border hover:border-border hover:bg-accent/30"
                }`}
                onClick={() => handleSetWorkflow(wf)}
              >
                <div className="flex items-center gap-2">
                  <FileJson className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs text-foreground truncate flex-1">{wf.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteWorkflow(wf.id); }}
                    className="p-0.5 text-muted-foreground hover:text-destructive rounded"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-muted-foreground">{wf.nodes.length} nodes</span>
                  <span className="text-[10px] text-primary">{wf.exposedParams.length} params</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Active workflow: I/O Mapping + Actions */}
        {activeWorkflow && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-3 h-3 text-primary" />
              <span className="text-xs text-foreground">{activeWorkflow.name}</span>
            </div>

            {/* I/O mapping */}
            <div className="bg-secondary/50 rounded-md p-2 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">I/O Mapping</div>

              {/* Input source */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  <Upload className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Input Node:</span>
                  <select
                    value={ioMapping.inputNodeId || ""}
                    onChange={(e) => setIOMapping((prev) => ({ ...prev, inputNodeId: e.target.value || null }))}
                    className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  >
                    <option value="">None</option>
                    {getLoadImageNodes().map((n) => (
                      <option key={n.id} value={n.id}>#{n.id} LoadImage</option>
                    ))}
                  </select>
                </div>
                {ioMapping.inputNodeId && (
                  <div className="flex items-center gap-2 text-xs pl-5">
                    <span className="text-muted-foreground">Source:</span>
                    <select
                      value={ioMapping.inputSource}
                      onChange={(e) => setIOMapping((prev) => ({ ...prev, inputSource: e.target.value as any }))}
                      className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                    >
                      <option value="selection">Selection Area</option>
                      <option value="active-layer">Active Layer</option>
                      <option value="flatten">Flatten All</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Mask node */}
              {getLoadImageNodes().length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <Square className="w-3 h-3 text-primary" />
                  <span className="text-muted-foreground">Mask Node:</span>
                  <select
                    value={ioMapping.maskNodeId || ""}
                    onChange={(e) => setIOMapping((prev) => ({ ...prev, maskNodeId: e.target.value || null }))}
                    className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                  >
                    <option value="">None</option>
                    {getLoadImageNodes().map((n) => (
                      <option key={n.id} value={n.id}>#{n.id} LoadImage</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Output node */}
              <div className="flex items-center gap-2 text-xs">
                <Download className="w-3 h-3 text-primary" />
                <span className="text-muted-foreground">Output:</span>
                <span className="text-foreground">New Layer</span>
                {getSaveImageNodes().length > 0 && (
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    ({getSaveImageNodes().length} output nodes)
                  </span>
                )}
              </div>
            </div>

            {/* Open full modal */}
            <button
              onClick={() => setShowWorkflowModal(true)}
              className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-accent border border-border py-2 rounded-md transition-colors text-xs text-muted-foreground hover:text-foreground"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Open Parameters
            </button>

            {/* Quick run */}
            <button
              onClick={() => {
                const vals: Record<string, unknown> = {};
                activeWorkflow.exposedParams.forEach((p) => { vals[`${p.nodeId}.${p.fieldName}`] = p.value; });
                handleRunComfyWorkflow(activeWorkflow, vals);
              }}
              disabled={isGenerating || !comfyConnected}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
            >
              {isGenerating ? (
                <><LoaderCircle className="w-3.5 h-3.5 animate-spin" />Processing...</>
              ) : (
                <><Play className="w-3.5 h-3.5" />Run Workflow</>
              )}
            </button>

            {!comfyConnected && (
              <div className="text-[10px] text-muted-foreground text-center">
                Connect to ComfyUI first to run workflows
              </div>
            )}
          </div>
        )}

        {/* Tools Row */}
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Tools</div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => setShowModelManager(true)}
              className="flex flex-col items-center gap-1 p-2 rounded-md border border-border hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Package className="w-3.5 h-3.5" />
              <span className="text-[10px]">Models</span>
            </button>
            <button
              onClick={() => setShowBatchProcessor(true)}
              disabled={!activeWorkflow}
              className="flex flex-col items-center gap-1 p-2 rounded-md border border-border hover:bg-accent/30 text-muted-foreground hover:text-foreground disabled:opacity-40 transition-colors"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="text-[10px]">Batch</span>
            </button>
            <button
              onClick={() => setShowSAM(true)}
              className="flex flex-col items-center gap-1 p-2 rounded-md border border-border hover:bg-accent/30 text-muted-foreground hover:text-foreground transition-colors"
            >
              <WandSparkles className="w-3.5 h-3.5" />
              <span className="text-[10px]">SAM</span>
            </button>
          </div>
        </div>

        {/* Setup Guide */}
        <div className="border border-border/50 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowSetupGuide(!showSetupGuide)}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/20 transition-colors text-left"
          >
            <ChevronRight
              className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${showSetupGuide ? "rotate-90" : ""}`}
            />
            <Server className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs text-foreground">Setup Guide</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Launcher scripts &amp; flags</span>
          </button>
          {showSetupGuide && (
            <div className="border-t border-border/30 p-3 max-h-[70vh] overflow-y-auto">
              <ConnectPanel />
            </div>
          )}
        </div>
      </div>

      <Suspense fallback={null}>
        {/* ComfyUI Workflow Modal */}
        {(showWorkflowModal || activeWorkflow) && (
          <ComfyWorkflowModal
            isOpen={showWorkflowModal}
            onClose={() => setShowWorkflowModal(false)}
            workflow={activeWorkflow}
            onSetWorkflow={handleSetWorkflow}
            onRun={handleRunComfyWorkflow}
            isRunning={isGenerating}
          />
        )}

        {/* Model Manager Modal */}
        {showModelManager && (
          <ModelManager
            open={showModelManager}
            onClose={() => setShowModelManager(false)}
          />
        )}

        {/* Batch Processor Modal */}
        {showBatchProcessor && (
          <BatchProcessor
            open={showBatchProcessor}
            onClose={() => setShowBatchProcessor(false)}
            workflow={activeWorkflow}
            inputNodeId={ioMapping.inputNodeId}
          />
        )}

        {/* SAM Integration Modal */}
        {showSAM && (
          <SAMIntegration
            open={showSAM}
            onClose={() => setShowSAM(false)}
          />
        )}
      </Suspense>
    </>
  );
}
