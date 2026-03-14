import { useState, useEffect } from "react";
import { WORKFLOW_PRESETS } from "./workflow-presets";
import {
  Sparkles,
  LoaderCircle,
  WandSparkles,
  Server,
  ChevronDown,
  ChevronRight,
  Upload,
  Download,
  Settings,
  FileJson,
  SlidersHorizontal,
  Maximize2,
  Trash2,
  Play,
  CircleAlert,
  CircleCheck,
  Square,
  CircleX,
  Package,
  Layers,
  Eye,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { useEditor, type Layer } from "./editor-store";
import {
  ComfyWorkflowModal,
  type ComfyWorkflowData,
} from "./comfyui-workflow-modal";
import { getComfyClient, type ComfyProgressEvent } from "./comfyui-client";
import {
  extractSelection,
  extractLayerImage,
  extractMaskImage,
  flattenLayers,
} from "./canvas-utils";
import { ModelManager } from "./model-manager";
import { BatchProcessor } from "./batch-processor";
import { SAMIntegration } from "./sam-integration";
import {
  useGeminiModels,
  GeminiModelManagerPanel,
} from "./gemini-model-manager";
import { ConnectPanel } from "./comfyui-connect-panel";

type AIMode = "generate" | "refine" | "comfyui";

// ─── I/O Mapping Types ──────────────────────────────────────────────
interface IOMapping {
  inputNodeId: string | null;   // LoadImage node ID to receive canvas input
  inputSource: "selection" | "active-layer" | "flatten"; // what to send
  outputNodeId: string | null;  // SaveImage node ID to read result from
  maskNodeId: string | null;    // LoadImage node for mask input (inpainting)
}

// Gemini conversation message
interface GeminiMessage {
  role: "user" | "model";
  text: string;
  imageUrl?: string; // generated image data URL
  timestamp: number;
}

export function AIPanel() {
  const {
    geminiApiKey,
    setGeminiApiKey,
    comfyuiUrl,
    setComfyuiUrl,
    generationPrompt,
    setGenerationPrompt,
    isGenerating,
    setIsGenerating,
    selection,
    addLayer,
    layers,
    activeLayerId,
    canvasWidth,
    canvasHeight,
  } = useEditor();

  const [aiMode, setAIMode] = useState<AIMode>("generate");
  const [showSettings, setShowSettings] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [comfyConnected, setComfyConnected] = useState(false);
  const [comfyError, setComfyError] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);

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

  // Progress tracking
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);

  // Gemini generation settings
  const [geminiModel, setGeminiModel] = useState("gemini-2.0-flash-exp");
  const [refineStrength, setRefineStrength] = useState(75);

  // Configurable Gemini model list
  const {
    models: geminiModels,
    addModel: addGeminiModel,
    removeModel: removeGeminiModel,
    moveModel: moveGeminiModel,
    setDefault: setGeminiDefault,
    getDefaultModel,
    resetToDefaults: resetGeminiModels,
  } = useGeminiModels();

  // Sync selected model with default on first render
  useEffect(() => {
    const def = getDefaultModel();
    if (def) setGeminiModel(def.modelId);
  }, []);

  // Phase 3: Conversation history
  const [conversationHistory, setConversationHistory] = useState<GeminiMessage[]>([]);
  const [showConversation, setShowConversation] = useState(false);

  // Phase 3: Modal states
  const [showModelManager, setShowModelManager] = useState(false);
  const [showBatchProcessor, setShowBatchProcessor] = useState(false);
  const [showSAM, setShowSAM] = useState(false);
  const [showSetupGuide, setShowSetupGuide] = useState(false);

  // ─── ComfyUI Connection ─────────────────────────────

  const handleTestComfyUI = async () => {
    setComfyError(null);
    setIsGenerating(true);
    try {
      const client = getComfyClient(comfyuiUrl);
      const stats = await client.testConnection();
      setComfyConnected(true);
      const device = stats.devices?.[0];
      if (device) {
        const vramGB = (device.vram_total / (1024 * 1024 * 1024)).toFixed(1);
        setProgressText(`Connected: ${device.name} (${vramGB} GB VRAM)`);
      } else {
        setProgressText("Connected to ComfyUI");
      }
      // Also connect WebSocket
      await client.connectWebSocket();
    } catch (err: any) {
      setComfyConnected(false);
      const msg = (err.message || "Connection failed") as string;
      if (
        msg.toLowerCase().includes("failed to fetch") ||
        msg.toLowerCase().includes("networkerror") ||
        msg.toLowerCase().includes("load") ||
        msg.toLowerCase().includes("cors")
      ) {
        setComfyError(
          `Cannot reach ComfyUI at ${comfyuiUrl}. Make sure ComfyUI is running with ` +
          `--enable-cors-header (see Setup Guide in the ComfyUI tab).`
        );
        setShowSetupGuide(true);
      } else {
        setComfyError(msg);
      }
      setProgressText("");
    }
    setIsGenerating(false);
  };

  // ─── Gemini Generate ────────────────────────────────

  const handleGeminiGenerate = async () => {
    if (!generationPrompt.trim()) return;
    if (!geminiApiKey) {
      setComfyError("Please set your Gemini API key in API Settings");
      return;
    }
    setIsGenerating(true);
    setComfyError(null);
    setProgressText("Calling Gemini API...");

    try {
      // Build prompt — include negative prompt if provided
      let fullPrompt = generationPrompt.trim();

      // In refine mode, encode the strength level into the instruction
      if (aiMode === "refine") {
        const strengthLabel =
          refineStrength < 30 ? "very subtle" :
          refineStrength < 55 ? "moderate" :
          refineStrength < 80 ? "significant" : "dramatic";
        fullPrompt = `Apply a ${strengthLabel} edit (strength: ${refineStrength}%) to this image: ${fullPrompt}`;
      }

      if (negativePrompt.trim()) {
        fullPrompt += `\n\nIMPORTANT — do NOT include the following in the image: ${negativePrompt.trim()}`;
      }

      // Build the request body for Gemini multimodal
      const parts: any[] = [
        { text: fullPrompt }
      ];

      // If there's a selection, include it as context
      if (selection) {
        setProgressText("Extracting selection...");
        const selectionData = await extractSelection(
          layers, canvasWidth, canvasHeight, selection
        );
        const base64 = selectionData.split(",")[1];
        parts.push({
          inline_data: {
            mime_type: "image/png",
            data: base64,
          }
        });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      
      setProgressText("Generating with Gemini...");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ["TEXT", "IMAGE"],
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData?.error?.message || `Gemini API error: ${response.status}`
        );
      }

      const data = await response.json();
      
      // Extract image from response
      let imageDataUrl: string | null = null;
      let textResponse = "";
      
      const candidate = data.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData || part.inline_data) {
            const inlineData = part.inlineData || part.inline_data;
            imageDataUrl = `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`;
          }
          if (part.text) {
            textResponse += part.text;
          }
        }
      }

      if (imageDataUrl) {
        // Load the image to get dimensions
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageDataUrl!;
        });

        const newLayer: Layer = {
          id: `ai-${Date.now()}`,
          name: `AI: ${generationPrompt.slice(0, 20)}...`,
          visible: true,
          locked: false,
          opacity: 100,
          type: "ai-generated",
          imageData: imageDataUrl,
          blendMode: "normal",
          x: selection?.x ?? Math.round((canvasWidth - img.width) / 2),
          y: selection?.y ?? Math.round((canvasHeight - img.height) / 2),
          width: selection?.width || img.width,
          height: selection?.height || img.height,
        };
        addLayer(newLayer);
        setProgressText("Image generated successfully!");
      } else if (textResponse) {
        // Gemini returned text only — show it as progress
        setProgressText(`Gemini: ${textResponse.slice(0, 100)}...`);
        // Create a text placeholder layer
        const size = selection ? Math.max(selection.width, selection.height) : 512;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(selection?.width || size);
        canvas.height = Math.round(selection?.height || size);
        const ctx = canvas.getContext("2d")!;
        ctx.fillStyle = "#1a1a2e";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#3ECF8E";
        ctx.font = "14px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("Gemini Response", canvas.width / 2, canvas.height / 2 - 10);
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "11px Inter, sans-serif";
        const words = textResponse.split(" ").slice(0, 8).join(" ");
        ctx.fillText(words + "...", canvas.width / 2, canvas.height / 2 + 15);

        const newLayer: Layer = {
          id: `ai-${Date.now()}`,
          name: `AI: ${generationPrompt.slice(0, 20)}`,
          visible: true,
          locked: false,
          opacity: 100,
          type: "ai-generated",
          imageData: canvas.toDataURL("image/png"),
          blendMode: "normal",
          x: selection?.x ?? 100,
          y: selection?.y ?? 100,
          width: canvas.width,
          height: canvas.height,
        };
        addLayer(newLayer);
      } else {
        throw new Error("No image or text in Gemini response");
      }

      setGenerationHistory((prev) => [generationPrompt, ...prev].slice(0, 10));
    } catch (err: any) {
      setComfyError(err.message || "Generation failed");
      setProgressText("");
    }
    setIsGenerating(false);
  };

  // ─── Gemini Image Analysis ─────────────────────────────────
  const handleGeminiAnalyze = async () => {
    if (!geminiApiKey) {
      setComfyError("Please set your Gemini API key in API Settings");
      return;
    }

    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (!activeLayer?.imageData && !selection) {
      setComfyError("Select a layer or area to analyze");
      return;
    }

    setIsGenerating(true);
    setComfyError(null);
    setProgressText("Analyzing image with Gemini...");

    try {
      const parts: any[] = [];
      const analysisPrompt = generationPrompt.trim() || "Analyze this image in detail. Describe what you see and suggest possible edits or improvements.";
      parts.push({ text: analysisPrompt });

      // Get image to analyze
      let imageData: string;
      if (selection) {
        imageData = await extractSelection(layers, canvasWidth, canvasHeight, selection);
      } else if (activeLayer?.imageData) {
        imageData = activeLayer.imageData;
      } else {
        const flattened = await flattenLayers(layers, canvasWidth, canvasHeight);
        imageData = flattened.toDataURL("image/png");
      }

      const base64 = imageData.split(",")[1];
      parts.push({
        inline_data: { mime_type: "image/png", data: base64 },
      });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

      // Build multi-turn contents array from conversation history
      const contents: any[] = [];
      for (const msg of conversationHistory.slice(-6)) {
        contents.push({
          role: msg.role,
          parts: [{ text: msg.text }],
        });
      }
      contents.push({ role: "user", parts });

      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          generationConfig: { responseModalities: ["TEXT"] },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      let textResponse = "";
      const candidate = data.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) textResponse += part.text;
        }
      }

      if (textResponse) {
        // Add to conversation history
        setConversationHistory((prev) => [
          ...prev,
          { role: "user", text: analysisPrompt, timestamp: Date.now() },
          { role: "model", text: textResponse, timestamp: Date.now() },
        ]);
        setProgressText("Analysis complete!");
        setShowConversation(true);
      } else {
        throw new Error("No response from Gemini");
      }
    } catch (err: any) {
      setComfyError(err.message || "Analysis failed");
      setProgressText("");
    }
    setIsGenerating(false);
  };

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

      // Build modified workflow JSON with user parameter values
      let modifiedJson = JSON.parse(JSON.stringify(wf.rawJson));
      for (const param of wf.exposedParams) {
        const key = `${param.nodeId}.${param.fieldName}`;
        const val = values[key] ?? param.value;
        if (modifiedJson[param.nodeId]?.inputs) {
          modifiedJson[param.nodeId].inputs[param.fieldName] = val;
        }
      }

      // ─── I/O Mapping: Upload canvas image to input node ─────
      if (ioMapping.inputNodeId && modifiedJson[ioMapping.inputNodeId]) {
        setProgressText("Uploading canvas input...");
        let inputDataUrl: string;

        if (ioMapping.inputSource === "selection" && selection) {
          inputDataUrl = await extractSelection(
            layers, canvasWidth, canvasHeight, selection
          );
        } else if (ioMapping.inputSource === "active-layer" && activeLayerId) {
          const activeLayer = layers.find((l) => l.id === activeLayerId);
          if (activeLayer) {
            inputDataUrl = await extractLayerImage(activeLayer);
          } else {
            throw new Error("No active layer found");
          }
        } else {
          // Flatten all visible layers
          const flattened = await flattenLayers(layers, canvasWidth, canvasHeight);
          inputDataUrl = flattened.toDataURL("image/png");
        }

        modifiedJson = await client.uploadAndSetImage(
          modifiedJson,
          ioMapping.inputNodeId,
          inputDataUrl,
          `canvas_input_${Date.now()}.png`
        );
      }

      // ─── Upload mask if mapped ──────────────────────────────
      if (ioMapping.maskNodeId && modifiedJson[ioMapping.maskNodeId]) {
        const activeLayer = layers.find((l) => l.id === activeLayerId);
        if (activeLayer?.maskData) {
          setProgressText("Uploading mask...");
          const maskDataUrl = await extractMaskImage(activeLayer);
          if (maskDataUrl) {
            modifiedJson = await client.uploadAndSetImage(
              modifiedJson,
              ioMapping.maskNodeId,
              maskDataUrl,
              `canvas_mask_${Date.now()}.png`
            );
          }
        }
      }

      // ─── Run the workflow ───────────────────────────────────
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
            setProgressText(
              `Executing: ${node?.class_type || `Node #${nodeId}`}`
            );
          }
        } else if (event.type === "execution_start") {
          setProgressText("Execution started...");
        }
      };

      const resultImages = await client.runWorkflow(modifiedJson, onProgress);

      if (resultImages.length === 0) {
        throw new Error("No output images received from ComfyUI");
      }

      // ─── Create layers from result images ───────────────────
      for (let i = 0; i < resultImages.length; i++) {
        const dataUrl = resultImages[i];
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = dataUrl;
        });

        const newLayer: Layer = {
          id: `comfy-${Date.now()}-${i}`,
          name: `ComfyUI: ${wf.name.slice(0, 15)}${resultImages.length > 1 ? ` #${i + 1}` : ""}`,
          visible: true,
          locked: false,
          opacity: 100,
          type: "ai-generated",
          imageData: dataUrl,
          blendMode: "normal",
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
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = wf;
        return next;
      }
      return [...prev, wf];
    });

    // Auto-detect I/O nodes
    const loadImageNodes = wf.nodes.filter(
      (n) => n.class_type === "LoadImage"
    );
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

  // ─── Get Load/Save Image nodes for I/O mapping UI ──────────
  const getLoadImageNodes = () =>
    activeWorkflow?.nodes.filter((n) => n.class_type === "LoadImage") || [];
  const getSaveImageNodes = () =>
    activeWorkflow?.nodes.filter(
      (n) => n.class_type === "SaveImage" || n.class_type === "PreviewImage"
    ) || [];

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Mode tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setAIMode("generate")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
              aiMode === "generate"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Sparkles className="w-3 h-3" />
            Generate
          </button>
          <button
            onClick={() => setAIMode("refine")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
              aiMode === "refine"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <WandSparkles className="w-3 h-3" />
            Refine
          </button>
          <button
            onClick={() => setAIMode("comfyui")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
              aiMode === "comfyui"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Server className="w-3 h-3" />
            ComfyUI
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* Settings toggle */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
          >
            <Settings className="w-3 h-3" />
            <span>API Settings</span>
            {showSettings ? (
              <ChevronDown className="w-3 h-3 ml-auto" />
            ) : (
              <ChevronRight className="w-3 h-3 ml-auto" />
            )}
          </button>

          {showSettings && (
            <div className="space-y-2 bg-secondary/50 rounded-md p-2">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  value={geminiApiKey}
                  onChange={(e) => setGeminiApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Gemini Model
                </label>
                <GeminiModelManagerPanel
                  models={geminiModels}
                  onAdd={addGeminiModel}
                  onRemove={removeGeminiModel}
                  onMove={moveGeminiModel}
                  onSetDefault={setGeminiDefault}
                  onReset={resetGeminiModels}
                  selectedModelId={geminiModel}
                  onSelectModel={setGeminiModel}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  ComfyUI Server URL
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={comfyuiUrl}
                    onChange={(e) => setComfyuiUrl(e.target.value)}
                    className="flex-1 bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={handleTestComfyUI}
                    disabled={isGenerating}
                    className="px-2 py-1 bg-secondary hover:bg-accent text-xs rounded-md border border-border transition-colors disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
                {comfyConnected && (
                  <div className="flex items-center gap-1 mt-1 text-xs text-primary">
                    <CircleCheck className="w-3 h-3" />
                    Connected
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error display */}
          {comfyError && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/20 rounded-md px-2.5 py-2 text-xs text-destructive">
              <CircleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <div className="flex-1">
                {comfyError}
                <button
                  onClick={() => setComfyError(null)}
                  className="ml-2 text-destructive/60 hover:text-destructive"
                >
                  <CircleX className="w-3 h-3 inline" />
                </button>
              </div>
            </div>
          )}

          {/* Progress display */}
          {(progressText || isGenerating) && (
            <div className="bg-primary/5 border border-primary/15 rounded-md px-2.5 py-2 space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-primary">
                {isGenerating && <LoaderCircle className="w-3 h-3 animate-spin shrink-0" />}
                <span className="truncate">{progressText || "Processing..."}</span>
              </div>
              {isGenerating && progressPercent > 0 && (
                <div className="w-full h-1 bg-primary/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-300"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Generate mode */}
          {aiMode === "generate" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Prompt
                </label>
                <textarea
                  value={generationPrompt}
                  onChange={(e) => setGenerationPrompt(e.target.value)}
                  placeholder="Describe the image you want to generate..."
                  rows={3}
                  className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Negative Prompt
                </label>
                <textarea
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="What to avoid..."
                  rows={2}
                  className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
                />
              </div>

              {selection && (
                <div className="bg-primary/10 border border-primary/20 rounded-md p-2 text-xs">
                  <div className="text-primary mb-1">Selection Active</div>
                  <div className="text-muted-foreground">
                    {Math.round(selection.width)} x{" "}
                    {Math.round(selection.height)} px at (
                    {Math.round(selection.x)}, {Math.round(selection.y)})
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    Selection will be sent as context + output placed here
                  </div>
                </div>
              )}

              <button
                onClick={handleGeminiGenerate}
                disabled={isGenerating || !generationPrompt.trim()}
                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
              >
                {isGenerating ? (
                  <>
                    <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate with Gemini
                  </>
                )}
              </button>
            </div>
          )}

          {/* Refine mode */}
          {aiMode === "refine" && (
            <div className="space-y-3">
              <div className="bg-secondary/50 rounded-md p-2 text-xs text-muted-foreground">
                Select an area on the canvas, then describe how you want to
                refine it. The selection is sent to Gemini as context.
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Refinement Prompt
                </label>
                <textarea
                  value={generationPrompt}
                  onChange={(e) => setGenerationPrompt(e.target.value)}
                  placeholder="Describe how to refine the selection..."
                  rows={3}
                  className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground w-16">
                  Strength
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={refineStrength}
                  onChange={(e) => setRefineStrength(Number(e.target.value))}
                  className="flex-1 accent-primary h-1"
                />
                <span className="text-xs w-8 text-right">{refineStrength}%</span>
              </div>
              {selection ? (
                <button
                  onClick={handleGeminiGenerate}
                  disabled={isGenerating || !generationPrompt.trim()}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                >
                  {isGenerating ? (
                    <>
                      <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                      Refining...
                    </>
                  ) : (
                    <>
                      <WandSparkles className="w-3.5 h-3.5" />
                      Refine Selection
                    </>
                  )}
                </button>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-2">
                  No selection. Use Rectangle Select tool first.
                </div>
              )}

              {/* Analyze Image button */}
              <button
                onClick={handleGeminiAnalyze}
                disabled={isGenerating || (!activeLayerId && !selection)}
                className="w-full flex items-center justify-center gap-2 bg-secondary text-foreground py-2 rounded-md hover:bg-accent border border-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
              >
                <Eye className="w-3.5 h-3.5" />
                Analyze Image
              </button>

              {/* Conversation History */}
              {conversationHistory.length > 0 && (
                <div className="space-y-1.5">
                  <button
                    onClick={() => setShowConversation(!showConversation)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full"
                  >
                    <MessageSquare className="w-3 h-3" />
                    <span>Conversation ({conversationHistory.length / 2})</span>
                    {showConversation ? (
                      <ChevronDown className="w-3 h-3 ml-auto" />
                    ) : (
                      <ChevronRight className="w-3 h-3 ml-auto" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setConversationHistory([]);
                      }}
                      className="p-0.5 text-muted-foreground hover:text-destructive"
                      title="Clear conversation"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  </button>

                  {showConversation && (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto">
                      {conversationHistory.map((msg, i) => (
                        <div
                          key={`conv-${i}`}
                          className={`rounded-md px-2 py-1.5 text-xs ${
                            msg.role === "user"
                              ? "bg-primary/10 text-primary"
                              : "bg-secondary/50 text-foreground"
                          }`}
                        >
                          <div className="text-[10px] text-muted-foreground mb-0.5">
                            {msg.role === "user" ? "You" : "Gemini"}
                          </div>
                          <div className="whitespace-pre-wrap text-[11px] leading-relaxed max-h-24 overflow-y-auto">
                            {msg.text.length > 300 ? msg.text.slice(0, 300) + "..." : msg.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ComfyUI mode */}
          {aiMode === "comfyui" && (
            <div className="space-y-3">
              {/* Connection status */}
              <div className="flex items-center gap-2 text-xs">
                <div
                  className={`w-2 h-2 rounded-full ${
                    comfyConnected ? "bg-primary" : "bg-muted-foreground"
                  }`}
                />
                <span
                  className={
                    comfyConnected ? "text-primary" : "text-muted-foreground"
                  }
                >
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
                      onChange={(e) => setComfyuiUrl(e.target.value)}
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
                onClick={() => {
                  setActiveWorkflow(null);
                  setShowWorkflowModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-accent border border-border border-dashed py-3 rounded-md transition-colors text-xs text-muted-foreground hover:text-foreground"
              >
                <Upload className="w-3.5 h-3.5" />
                Import Workflow JSON
              </button>

              {/* ─── Workflow Presets ─────────────────────────────── */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Presets
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {WORKFLOW_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        // Deep clone the preset workflow
                        const wfClone: ComfyWorkflowData = {
                          ...preset.workflow,
                          id: `${preset.id}-${Date.now()}`,
                          rawJson: JSON.parse(JSON.stringify(preset.workflow.rawJson)),
                          exposedParams: preset.workflow.exposedParams.map((p) => ({ ...p })),
                          nodes: preset.workflow.nodes.map((n) => ({ ...n, inputs: { ...n.inputs } })),
                        };
                        handleSetWorkflow(wfClone);
                        // Set I/O mapping from preset
                        setIOMapping({
                          inputNodeId: preset.inputNodeId,
                          inputSource: preset.maskRequired ? "active-layer" : (preset.inputRequired ? "selection" : "selection"),
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
                        <span className="text-xs text-foreground truncate flex-1">
                          {wf.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteWorkflow(wf.id);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-destructive rounded"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">
                          {wf.nodes.length} nodes
                        </span>
                        <span className="text-[10px] text-primary">
                          {wf.exposedParams.length} params
                        </span>
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
                    <span className="text-xs text-foreground">
                      {activeWorkflow.name}
                    </span>
                  </div>

                  {/* I/O mapping */}
                  <div className="bg-secondary/50 rounded-md p-2 space-y-2">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                      I/O Mapping
                    </div>

                    {/* Input source */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <Upload className="w-3 h-3 text-primary" />
                        <span className="text-muted-foreground">Input Node:</span>
                        <select
                          value={ioMapping.inputNodeId || ""}
                          onChange={(e) =>
                            setIOMapping((prev) => ({
                              ...prev,
                              inputNodeId: e.target.value || null,
                            }))
                          }
                          className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                        >
                          <option value="">None</option>
                          {getLoadImageNodes().map((n) => (
                            <option key={n.id} value={n.id}>
                              #{n.id} LoadImage
                            </option>
                          ))}
                        </select>
                      </div>
                      {ioMapping.inputNodeId && (
                        <div className="flex items-center gap-2 text-xs pl-5">
                          <span className="text-muted-foreground">Source:</span>
                          <select
                            value={ioMapping.inputSource}
                            onChange={(e) =>
                              setIOMapping((prev) => ({
                                ...prev,
                                inputSource: e.target.value as any,
                              }))
                            }
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
                          onChange={(e) =>
                            setIOMapping((prev) => ({
                              ...prev,
                              maskNodeId: e.target.value || null,
                            }))
                          }
                          className="flex-1 bg-secondary text-xs rounded px-1.5 py-0.5 border border-border"
                        >
                          <option value="">None</option>
                          {getLoadImageNodes().map((n) => (
                            <option key={n.id} value={n.id}>
                              #{n.id} LoadImage
                            </option>
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
                      // Quick run with default values
                      const vals: Record<string, unknown> = {};
                      activeWorkflow.exposedParams.forEach((p) => {
                        vals[`${p.nodeId}.${p.fieldName}`] = p.value;
                      });
                      handleRunComfyWorkflow(activeWorkflow, vals);
                    }}
                    disabled={isGenerating || !comfyConnected}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
                  >
                    {isGenerating ? (
                      <>
                        <LoaderCircle className="w-3.5 h-3.5 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" />
                        Run Workflow
                      </>
                    )}
                  </button>

                  {!comfyConnected && (
                    <div className="text-[10px] text-muted-foreground text-center">
                      Connect to ComfyUI first to run workflows
                    </div>
                  )}
                </div>
              )}

              {/* ─── P3: Tools Row (Model Manager, Batch, SAM) ───── */}
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Tools
                </div>
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

              {/* ─── Setup Guide ─────────────────────────────────── */}
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
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    Launcher scripts &amp; flags
                  </span>
                </button>
                {showSetupGuide && (
                  <div className="border-t border-border/30 p-3 max-h-[70vh] overflow-y-auto">
                    <ConnectPanel />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generation History */}
          {generationHistory.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                History
              </div>
              {generationHistory.map((prompt, i) => (
                <button
                  key={`${prompt}-${i}`}
                  onClick={() => setGenerationPrompt(prompt)}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground bg-secondary/50 hover:bg-secondary rounded-md px-2 py-1.5 truncate transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ComfyUI Workflow Modal */}
      <ComfyWorkflowModal
        isOpen={showWorkflowModal}
        onClose={() => setShowWorkflowModal(false)}
        workflow={activeWorkflow}
        onSetWorkflow={handleSetWorkflow}
        onRun={handleRunComfyWorkflow}
        isRunning={isGenerating}
      />

      {/* Model Manager Modal */}
      <ModelManager
        open={showModelManager}
        onClose={() => setShowModelManager(false)}
      />

      {/* Batch Processor Modal */}
      <BatchProcessor
        open={showBatchProcessor}
        onClose={() => setShowBatchProcessor(false)}
        workflow={activeWorkflow}
        inputNodeId={ioMapping.inputNodeId}
      />

      {/* SAM Integration Modal */}
      <SAMIntegration
        open={showSAM}
        onClose={() => setShowSAM(false)}
      />
    </>
  );
}