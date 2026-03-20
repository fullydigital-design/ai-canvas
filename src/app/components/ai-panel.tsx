/**
 * AI Panel — thin tab container that delegates to GeminiTab / ComfyUITab.
 * Owns shared state: error, progress, settings, generation history.
 */
import { useEffect, useState } from "react";
import {
  Sparkles,
  WandSparkles,
  Server,
  ChevronDown,
  ChevronRight,
  Settings,
  CircleAlert,
  CircleCheck,
  CircleX,
} from "lucide-react";
import { useEditor, useEditorSelector } from "./editor-store";
import { getComfyClient } from "./comfyui-client";
import {
  useGeminiModels,
  GeminiModelManagerPanel,
} from "./gemini-model-manager";
import { GeminiTab, type AIMode } from "./ai-gemini-tab";
import { ComfyUITab } from "./ai-comfyui-tab";
import { useShallow } from "zustand/react/shallow";

type FullMode = AIMode | "comfyui";
type GeminiValidationStatus = "idle" | "validating" | "valid" | "invalid";

export function AIPanel() {
  const {
    geminiApiKey,
    setGeminiApiKey,
    comfyuiUrl,
    setComfyuiUrl,
    isGenerating,
    setIsGenerating,
  } = useEditorSelector(
    useShallow((s) => ({
      geminiApiKey: s.geminiApiKey,
      setGeminiApiKey: s.setGeminiApiKey,
      comfyuiUrl: s.comfyuiUrl,
      setComfyuiUrl: s.setComfyuiUrl,
      isGenerating: s.isGenerating,
      setIsGenerating: s.setIsGenerating,
    }))
  );

  const [aiMode, setAIMode] = useState<FullMode>("generate");
  const [showSettings, setShowSettings] = useState(false);
  const [comfyConnected, setComfyConnected] = useState(false);
  const [comfyError, setComfyError] = useState<string | null>(null);
  const [generationHistory, setGenerationHistory] = useState<string[]>([]);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [geminiValidationStatus, setGeminiValidationStatus] = useState<GeminiValidationStatus>("idle");
  const [geminiValidationMessage, setGeminiValidationMessage] = useState("Not validated yet");

  const {
    models: geminiModels,
    addModel: addGeminiModel,
    removeModel: removeGeminiModel,
    moveModel: moveGeminiModel,
    setDefault: setGeminiDefault,
    getDefaultModel,
    resetToDefaults: resetGeminiModels,
  } = useGeminiModels();
  const [geminiModel, setGeminiModel] = useState(() => getDefaultModel()?.modelId || "");

  // Keep selected model valid when model list changes.
  useEffect(() => {
    if (geminiModels.length === 0) return;
    if (geminiModels.some((m) => m.modelId === geminiModel)) return;
    const nextDefault = getDefaultModel()?.modelId || geminiModels[0].modelId;
    if (nextDefault !== geminiModel) {
      setGeminiModel(nextDefault);
    }
  }, [geminiModels, geminiModel, getDefaultModel]);

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
      try {
        await client.connectWebSocket();
      } catch {
        setProgressText((prev) =>
          prev ? `${prev} (WS unavailable, polling fallback enabled)` : "Connected (WS unavailable, polling fallback enabled)"
        );
      }
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
      } else if (
        msg.includes("403") ||
        msg.toLowerCase().includes("origin") ||
        msg.toLowerCase().includes("websocket")
      ) {
        setComfyError(
          `ComfyUI rejected connection (403 / origin check). In browser dev use the Bridge Agent URL ` +
          `(e.g. http://127.0.0.1:8765). In direct mode, start ComfyUI with CORS/origin flags.`
        );
      } else {
        setComfyError(msg);
      }
      setProgressText("");
    }
    setIsGenerating(false);
  };

  const handleValidateGeminiApi = async () => {
    if (!geminiApiKey.trim()) {
      setGeminiValidationStatus("invalid");
      setGeminiValidationMessage("Gemini API key is missing");
      return;
    }
    if (!geminiModel.trim()) {
      setGeminiValidationStatus("invalid");
      setGeminiValidationMessage("Select a Gemini model");
      return;
    }

    setGeminiValidationStatus("validating");
    setGeminiValidationMessage("Validating key and selected model...");

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiApiKey)}`;
      const response = await fetch(url);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = data?.error?.message || `Gemini API error: ${response.status}`;
        throw new Error(msg);
      }

      const models = Array.isArray(data?.models) ? data.models : [];
      const selected = models.find((m: any) => {
        const name = typeof m?.name === "string" ? m.name : "";
        return name === `models/${geminiModel}` || name.endsWith(`/${geminiModel}`);
      });
      if (!selected) {
        throw new Error(
          `Model "${geminiModel}" is not listed for this API key/version. Pick another model from the dropdown.`
        );
      }

      const methods = Array.isArray(selected.supportedGenerationMethods)
        ? selected.supportedGenerationMethods
        : [];
      if (!methods.includes("generateContent")) {
        throw new Error(
          `Model "${geminiModel}" does not support generateContent for this endpoint.`
        );
      }

      setGeminiValidationStatus("valid");
      setGeminiValidationMessage(`API key valid. "${geminiModel}" is ready.`);
    } catch (err: any) {
      setGeminiValidationStatus("invalid");
      setGeminiValidationMessage(err?.message || "Gemini API validation failed");
    }
  };

  const validationToneClass =
    geminiValidationStatus === "valid"
      ? "text-green-500"
      : geminiValidationStatus === "invalid"
      ? "text-destructive"
      : geminiValidationStatus === "validating"
      ? "text-primary"
      : "text-muted-foreground";

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="flex border-b border-border">
          {(["generate", "refine", "comfyui"] as FullMode[]).map((mode) => {
            const Icon = mode === "generate" ? Sparkles : mode === "refine" ? WandSparkles : Server;
            const label = mode === "comfyui" ? "ComfyUI" : mode.charAt(0).toUpperCase() + mode.slice(1);
            return (
              <button
                key={mode}
                onClick={() => setAIMode(mode)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs transition-colors ${
                  aiMode === mode
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {comfyError && (
            <div className="flex items-start gap-2 bg-destructive/10 border border-destructive/30 rounded-md p-2 text-xs text-destructive">
              <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <div className="flex-1">{comfyError}</div>
              <button onClick={() => setComfyError(null)}>
                <CircleX className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {progressText && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleCheck className="w-3.5 h-3.5 text-primary shrink-0" />
              {progressText}
            </div>
          )}

          {/* Tab content */}
          {aiMode === "comfyui" ? (
            <ComfyUITab
              comfyConnected={comfyConnected}
              setComfyConnected={setComfyConnected}
              comfyError={comfyError}
              setComfyError={setComfyError}
              progressText={progressText}
              setProgressText={setProgressText}
              progressPercent={progressPercent}
              setProgressPercent={setProgressPercent}
              showSetupGuide={showSetupGuide}
              setShowSetupGuide={setShowSetupGuide}
              handleTestComfyUI={handleTestComfyUI}
            />
          ) : (
            <GeminiTab
              aiMode={aiMode}
              geminiModel={geminiModel}
              comfyError={comfyError}
              setComfyError={setComfyError}
              progressText={progressText}
              setProgressText={setProgressText}
              generationHistory={generationHistory}
              setGenerationHistory={setGenerationHistory}
            />
          )}

          {/* Generation History */}
          {generationHistory.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Recent</div>
              {generationHistory.slice(0, 5).map((prompt, i) => (
                <button
                  key={`hist-${i}`}
                  onClick={() => useEditor.getState().setGenerationPrompt(prompt)}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground truncate py-0.5"
                  title={prompt}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Settings */}
          <div className="border border-border/50 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-accent/20 transition-colors text-left"
            >
              <ChevronRight
                className={`w-3 h-3 text-muted-foreground transition-transform duration-200 ${showSettings ? "rotate-90" : ""}`}
              />
              <Settings className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-foreground">API Settings</span>
            </button>
            {showSettings && (
              <div className="border-t border-border/30 p-3 space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Gemini API Key</label>
                  <input
                    type="password"
                    value={geminiApiKey}
                    onChange={(e) => {
                      setGeminiApiKey(e.target.value);
                      setGeminiValidationStatus("idle");
                      setGeminiValidationMessage("Not validated yet");
                    }}
                    placeholder="AIza..."
                    className="w-full bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                  />
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <div className={`text-[11px] ${validationToneClass}`}>
                      API verification:{" "}
                      {geminiValidationStatus === "valid"
                        ? "Valid"
                        : geminiValidationStatus === "invalid"
                        ? "Invalid"
                        : geminiValidationStatus === "validating"
                        ? "Validating..."
                        : "Not checked"}
                    </div>
                    <button
                      onClick={handleValidateGeminiApi}
                      disabled={geminiValidationStatus === "validating"}
                      className="px-2 py-1 text-[11px] rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50"
                    >
                      Validate API
                    </button>
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{geminiValidationMessage}</div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">ComfyUI URL</label>
                  <div className="flex gap-1.5">
                    <input
                      value={comfyuiUrl}
                      onChange={(e) => setComfyuiUrl(e.target.value)}
                      placeholder="http://127.0.0.1:8188"
                      className="flex-1 bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
                    />
                    <button
                      onClick={handleTestComfyUI}
                      disabled={isGenerating}
                      className="px-2 py-1.5 bg-primary text-primary-foreground text-xs rounded-md hover:bg-primary/90 disabled:opacity-50"
                    >
                      Test
                    </button>
                  </div>
                  {comfyConnected && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-green-500">
                      <CircleCheck className="w-3 h-3" />
                      Connected
                    </div>
                  )}
                </div>
                <GeminiModelManagerPanel
                  models={geminiModels}
                  onAdd={addGeminiModel}
                  onRemove={removeGeminiModel}
                  onMove={moveGeminiModel}
                  onSetDefault={setGeminiDefault}
                  onReset={resetGeminiModels}
                  selectedModelId={geminiModel}
                  onSelectModel={(modelId) => {
                    setGeminiModel(modelId);
                    setGeminiValidationStatus("idle");
                    setGeminiValidationMessage("Not validated yet");
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
