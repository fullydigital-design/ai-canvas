/**
 * Gemini Tab — Generate + Refine modes with conversation history.
 * Extracted from ai-panel.tsx for modularity.
 */
import { useState } from "react";
import {
  Sparkles,
  LoaderCircle,
  WandSparkles,
  Eye,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  RotateCcw,
} from "lucide-react";
import { useEditorSelector, type Layer, getLayerImageDataUrl, layerHasImage } from "./editor-store";
import { imageCache as globalImageCache, generateImageRef } from "./image-cache";
import { extractSelection, flattenLayers } from "./canvas-utils";
import { useShallow } from "zustand/react/shallow";

// Gemini conversation message
interface GeminiMessage {
  role: "user" | "model";
  text: string;
  imageUrl?: string;
  timestamp: number;
}

export type AIMode = "generate" | "refine";

export interface GeminiTabProps {
  aiMode: AIMode;
  geminiModel: string;
  comfyError: string | null;
  setComfyError: (v: string | null) => void;
  progressText: string;
  setProgressText: (v: string) => void;
  generationHistory: string[];
  setGenerationHistory: React.Dispatch<React.SetStateAction<string[]>>;
}

export function GeminiTab({
  aiMode,
  geminiModel,
  comfyError,
  setComfyError,
  progressText,
  setProgressText,
  generationHistory,
  setGenerationHistory,
}: GeminiTabProps) {
  const {
    geminiApiKey,
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
  } = useEditorSelector(
    useShallow((s) => ({
      geminiApiKey: s.geminiApiKey,
      generationPrompt: s.generationPrompt,
      setGenerationPrompt: s.setGenerationPrompt,
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

  const [negativePrompt, setNegativePrompt] = useState("");
  const [refineStrength, setRefineStrength] = useState(75);

  // Conversation history
  const [conversationHistory, setConversationHistory] = useState<GeminiMessage[]>([]);
  const [showConversation, setShowConversation] = useState(false);

  // ─── Gemini Generate ────────────────────────────────

  const handleGeminiGenerate = async () => {
    if (!generationPrompt.trim()) return;
    if (!geminiApiKey) {
      setComfyError("Please set your Gemini API key in API Settings");
      return;
    }
    if (!geminiModel) {
      setComfyError("Please select a Gemini model in API Settings");
      return;
    }
    setIsGenerating(true);
    setComfyError(null);
    setProgressText("Calling Gemini API...");

    try {
      let fullPrompt = generationPrompt.trim();
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

      const parts: any[] = [{ text: fullPrompt }];
      if (selection) {
        setProgressText("Extracting selection...");
        const selectionData = await extractSelection(layers, canvasWidth, canvasHeight, selection);
        const base64 = selectionData.split(",")[1];
        parts.push({ inline_data: { mime_type: "image/png", data: base64 } });
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      setProgressText("Generating with Gemini...");
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 404) {
          throw new Error(
            `Model "${geminiModel}" is not available for this API key/version. Use API Validation in Settings and choose a supported model.`
          );
        }
        throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
      }

      const data = await response.json();
      let imageDataUrl: string | null = null;
      let textResponse = "";
      const candidate = data.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.inlineData || part.inline_data) {
            const inlineData = part.inlineData || part.inline_data;
            imageDataUrl = `data:${inlineData.mimeType || inlineData.mime_type || "image/png"};base64,${inlineData.data}`;
          }
          if (part.text) textResponse += part.text;
        }
      }

      if (imageDataUrl) {
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.src = imageDataUrl!;
        });
        const ref = generateImageRef();
        globalImageCache.putSync(imageDataUrl!, ref);
        const newLayer: Layer = {
          id: `ai-${Date.now()}`,
          name: `AI: ${generationPrompt.slice(0, 20)}...`,
          visible: true, locked: false, opacity: 100, type: "ai-generated",
          imageRef: ref, blendMode: "normal",
          x: selection?.x ?? Math.round((canvasWidth - img.width) / 2),
          y: selection?.y ?? Math.round((canvasHeight - img.height) / 2),
          width: selection?.width || img.width,
          height: selection?.height || img.height,
        };
        addLayer(newLayer);
        setProgressText("Image generated successfully!");
      } else if (textResponse) {
        setProgressText(`Gemini: ${textResponse.slice(0, 100)}...`);
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
        const textRef = generateImageRef();
        globalImageCache.putSync(canvas.toDataURL("image/png"), textRef);
        const newLayer: Layer = {
          id: `ai-${Date.now()}`,
          name: `AI: ${generationPrompt.slice(0, 20)}`,
          visible: true, locked: false, opacity: 100, type: "ai-generated",
          imageRef: textRef, blendMode: "normal",
          x: selection?.x ?? 100, y: selection?.y ?? 100,
          width: canvas.width, height: canvas.height,
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
    if (!geminiModel) {
      setComfyError("Please select a Gemini model in API Settings");
      return;
    }
    const activeLayer = layers.find((l) => l.id === activeLayerId);
    if (activeLayer && !layerHasImage(activeLayer) && !selection) {
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

      let imgDataUrl: string;
      if (selection) {
        imgDataUrl = await extractSelection(layers, canvasWidth, canvasHeight, selection);
      } else if (activeLayer && layerHasImage(activeLayer)) {
        imgDataUrl = getLayerImageDataUrl(activeLayer) || "";
      } else {
        const flattened = await flattenLayers(layers, canvasWidth, canvasHeight);
        imgDataUrl = flattened.toDataURL("image/png");
      }
      const base64 = imgDataUrl.split(",")[1];
      parts.push({ inline_data: { mime_type: "image/png", data: base64 } });

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      const contents: any[] = [];
      for (const msg of conversationHistory.slice(-6)) {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
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
        if (response.status === 404) {
          throw new Error(
            `Model "${geminiModel}" is not available for this API key/version. Use API Validation in Settings and choose a supported model.`
          );
        }
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


  // ─── Generate mode JSX ───────────────────────────────
  if (aiMode === "generate") {
    return (
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Prompt</label>
          <textarea
            value={generationPrompt}
            onChange={(e) => setGenerationPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={3}
            className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Negative Prompt</label>
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
              {Math.round(selection.width)} x {Math.round(selection.height)} px at ({Math.round(selection.x)}, {Math.round(selection.y)})
            </div>
            <div className="text-muted-foreground mt-0.5">Selection will be sent as context + output placed here</div>
          </div>
        )}
        <button
          onClick={handleGeminiGenerate}
          disabled={isGenerating || !generationPrompt.trim()}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-xs"
        >
          {isGenerating ? (
            <><LoaderCircle className="w-3.5 h-3.5 animate-spin" />Generating...</>
          ) : (
            <><Sparkles className="w-3.5 h-3.5" />Generate with Gemini</>
          )}
        </button>
      </div>
    );
  }

  // ─── Refine mode JSX ───────────────────────────────
  return (
    <div className="space-y-3">
      <div className="bg-secondary/50 rounded-md p-2 text-xs text-muted-foreground">
        Select an area on the canvas, then describe how you want to refine it. The selection is sent to Gemini as context.
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Refinement Prompt</label>
        <textarea
          value={generationPrompt}
          onChange={(e) => setGenerationPrompt(e.target.value)}
          placeholder="Describe how to refine the selection..."
          rows={3}
          className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none resize-none"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted-foreground w-16">Strength</label>
        <input
          type="range" min={0} max={100} value={refineStrength}
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
            <><LoaderCircle className="w-3.5 h-3.5 animate-spin" />Refining...</>
          ) : (
            <><WandSparkles className="w-3.5 h-3.5" />Refine Selection</>
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
              onClick={(e) => { e.stopPropagation(); setConversationHistory([]); }}
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
  );
}
