/**
 * Gemini Model Manager — configurable model list for the Gemini API dropdown.
 * Users can add, remove, reorder models, mark them as IMAGE or VIDEO,
 * and set defaults. Persisted to localStorage.
 */
import { useState, useEffect, useCallback } from "react";
import {
  Plus,
  X,
  ChevronUp,
  ChevronDown,
  Image as ImageIcon,
  Video,
  Settings2,
} from "lucide-react";

export type GeminiModelType = "image" | "video";

export interface GeminiModelEntry {
  id: string; // unique key
  modelId: string; // API model ID e.g. "gemini-3.1-flash-image-preview"
  displayName: string; // e.g. "Gemini 2.0 Flash"
  type: GeminiModelType;
  isDefault?: boolean;
}

const STORAGE_KEY = "ai-canvas-gemini-models";

const BUILT_IN_MODELS: GeminiModelEntry[] = [
  {
    id: "builtin-1",
    modelId: "gemini-3.1-flash-image-preview",
    displayName: "Nana Banana 2",
    type: "image",
    isDefault: true,
  },
  {
    id: "builtin-2",
    modelId: "gemini-3-pro-image-preview",
    displayName: "Nana Banana Pro",
    type: "image",
  },
];

const REMOVED_MODEL_IDS = new Set([
  "gemini-2.0-flash-exp",
  "gemini-1.5-pro",
  "gemini-1.5-flash",
]);

function isValidModelType(value: unknown): value is GeminiModelType {
  return value === "image" || value === "video";
}

function normalizeModels(input: unknown): GeminiModelEntry[] {
  const rawList = Array.isArray(input) ? input : [];
  const sanitized: GeminiModelEntry[] = [];

  for (const raw of rawList) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const modelId = typeof rec.modelId === "string" ? rec.modelId.trim() : "";
    if (!modelId || REMOVED_MODEL_IDS.has(modelId)) continue;
    const displayName = typeof rec.displayName === "string" ? rec.displayName.trim() : modelId;
    const type: GeminiModelType = isValidModelType(rec.type) ? rec.type : "image";
    const id =
      typeof rec.id === "string" && rec.id.trim().length > 0
        ? rec.id
        : `model-${Math.random().toString(36).slice(2, 8)}`;
    sanitized.push({
      id,
      modelId,
      displayName: displayName || modelId,
      type,
      isDefault: false,
    });
  }

  const byModelId = new Map(sanitized.map((m) => [m.modelId, m] as const));
  const next: GeminiModelEntry[] = BUILT_IN_MODELS.map((base, index) => {
    const existing = byModelId.get(base.modelId);
    return {
      ...base,
      ...(existing || {}),
      id: base.id,
      modelId: base.modelId,
      displayName: existing?.displayName || base.displayName,
      type: existing?.type || base.type,
      isDefault: index === 0,
    };
  });

  for (const m of sanitized) {
    if (next.some((x) => x.modelId === m.modelId)) continue;
    next.push({ ...m, isDefault: false });
  }

  return next;
}

// ─── Hook: useGeminiModels ─────────────────────────────────────────

export function useGeminiModels() {
  const [models, setModels] = useState<GeminiModelEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        const normalized = normalizeModels(parsed);
        if (normalized.length > 0) return normalized;
      }
    } catch {}
    return normalizeModels(BUILT_IN_MODELS);
  });

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(models));
  }, [models]);

  const addModel = useCallback(
    (modelId: string, displayName: string, type: GeminiModelType) => {
      const trimmedId = modelId.trim();
      if (!trimmedId || REMOVED_MODEL_IDS.has(trimmedId)) return;
      setModels((prev) => {
        if (prev.some((m) => m.modelId === trimmedId)) return prev;
        const entry: GeminiModelEntry = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          modelId: trimmedId,
          displayName: displayName.trim() || trimmedId,
          type,
          isDefault: false,
        };
        return [...prev, entry];
      });
    },
    []
  );

  const removeModel = useCallback((id: string) => {
    setModels((prev) => {
      const next = prev.filter((m) => m.id !== id);
      // If we removed the default, make the first one default
      if (next.length > 0 && !next.some((m) => m.isDefault)) {
        next[0] = { ...next[0], isDefault: true };
      }
      return next;
    });
  }, []);

  const moveModel = useCallback((id: string, direction: "up" | "down") => {
    setModels((prev) => {
      const idx = prev.findIndex((m) => m.id === id);
      if (idx < 0) return prev;
      const swapIdx = direction === "up" ? idx - 1 : idx + 1;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  }, []);

  const setDefault = useCallback((id: string) => {
    setModels((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === id }))
    );
  }, []);

  const getDefaultModel = useCallback(() => {
    return models.find((m) => m.isDefault) || models[0] || BUILT_IN_MODELS[0];
  }, [models]);

  const resetToDefaults = useCallback(() => {
    setModels(normalizeModels(BUILT_IN_MODELS));
  }, []);

  return {
    models,
    addModel,
    removeModel,
    moveModel,
    setDefault,
    getDefaultModel,
    resetToDefaults,
  };
}

// ─── Manager Panel (inline, used inside API Settings) ────────────────

interface GeminiModelManagerProps {
  models: GeminiModelEntry[];
  onAdd: (modelId: string, displayName: string, type: GeminiModelType) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, direction: "up" | "down") => void;
  onSetDefault: (id: string) => void;
  onReset: () => void;
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
}

export function GeminiModelManagerPanel({
  models,
  onAdd,
  onRemove,
  onMove,
  onSetDefault,
  onReset,
  selectedModelId,
  onSelectModel,
}: GeminiModelManagerProps) {
  const [showManager, setShowManager] = useState(false);
  const [newModelId, setNewModelId] = useState("");
  const [newDisplayName, setNewDisplayName] = useState("");
  const [newType, setNewType] = useState<GeminiModelType>("image");

  const handleAdd = () => {
    if (!newModelId.trim()) return;
    onAdd(newModelId, newDisplayName, newType);
    setNewModelId("");
    setNewDisplayName("");
    setNewType("image");
  };

  return (
    <div className="space-y-1.5">
      {/* Model selector dropdown */}
      <div className="flex gap-1">
        <select
          value={selectedModelId}
          onChange={(e) => onSelectModel(e.target.value)}
          className="flex-1 bg-secondary text-foreground text-xs rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none"
        >
          {models.map((m) => (
            <option key={m.id} value={m.modelId}>
              {m.displayName}
              {m.isDefault ? " ★" : ""}
            </option>
          ))}
          {models.length === 0 && (
            <option value="">No models configured</option>
          )}
        </select>
        <button
          onClick={() => setShowManager(!showManager)}
          className={`px-1.5 py-1 rounded-md border transition-colors ${
            showManager
              ? "bg-primary/10 border-primary/30 text-primary"
              : "bg-secondary border-border text-muted-foreground hover:text-foreground"
          }`}
          title="Manage models"
        >
          <Settings2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Manager panel */}
      {showManager && (
        <div className="border border-border rounded-lg bg-secondary/30 overflow-hidden">
          {/* Header */}
          <div className="px-2.5 py-1.5 border-b border-border flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Gallery Models
            </span>
            <button
              onClick={onReset}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Reset defaults
            </button>
          </div>

          {/* Info */}
          <div className="px-2.5 py-1.5 text-[10px] text-muted-foreground border-b border-border">
            Manage the list of models available in the dropdown. The first model
            is selected by default. If no models are configured, a built-in
            default list is used.
          </div>

          {/* Model list */}
          <div className="divide-y divide-border">
            {models.map((model, idx) => (
              <div
                key={model.id}
                className="flex items-center gap-1.5 px-2.5 py-2 group hover:bg-accent/10 transition-colors"
              >
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-foreground truncate">
                      {model.displayName}
                    </span>
                    {model.isDefault && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wider px-1 py-px rounded bg-orange-500/15 text-orange-400 border border-orange-500/20">
                        default
                      </span>
                    )}
                    <span
                      className={`shrink-0 text-[9px] uppercase tracking-wider px-1 py-px rounded border flex items-center gap-0.5 ${
                        model.type === "image"
                          ? "bg-blue-500/15 text-blue-400 border-blue-500/20"
                          : "bg-purple-500/15 text-purple-400 border-purple-500/20"
                      }`}
                    >
                      {model.type === "image" ? (
                        <ImageIcon className="w-2.5 h-2.5" />
                      ) : (
                        <Video className="w-2.5 h-2.5" />
                      )}
                      {model.type}
                    </span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                    {model.modelId}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  {!model.isDefault && (
                    <button
                      onClick={() => onSetDefault(model.id)}
                      className="p-0.5 text-[9px] text-muted-foreground hover:text-orange-400 transition-colors"
                      title="Set as default"
                    >
                      ★
                    </button>
                  )}
                  <button
                    onClick={() => onMove(model.id, "up")}
                    disabled={idx === 0}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move up"
                  >
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onMove(model.id, "down")}
                    disabled={idx === models.length - 1}
                    className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
                    title="Move down"
                  >
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onRemove(model.id)}
                    className="p-0.5 text-muted-foreground hover:text-destructive transition-colors"
                    title="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}

            {models.length === 0 && (
              <div className="px-2.5 py-4 text-center text-xs text-muted-foreground">
                No models. Click "Reset defaults" or add one below.
              </div>
            )}
          </div>

          {/* Add model form */}
          <div className="border-t border-border px-2.5 py-2 space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Add Model
            </div>
            <div className="flex gap-1">
              <input
                value={newModelId}
                onChange={(e) => setNewModelId(e.target.value)}
                placeholder="Model ID (e.g. gemini-3.1-flash-image-preview)"
                className="flex-1 bg-secondary text-foreground text-[11px] font-mono rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none placeholder:text-muted-foreground/50"
              />
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Display Name (e.g. Gemini Flash)"
                className="flex-1 bg-secondary text-foreground text-[11px] rounded-md px-2 py-1.5 border border-border focus:border-primary focus:outline-none placeholder:text-muted-foreground/50"
              />
            </div>
            <div className="flex gap-1.5 items-center">
              {/* Type toggle */}
              <div className="flex rounded-md border border-border overflow-hidden flex-1">
                <button
                  onClick={() => setNewType("image")}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] transition-colors ${
                    newType === "image"
                      ? "bg-blue-500/15 text-blue-400 border-r border-blue-500/20"
                      : "bg-secondary text-muted-foreground border-r border-border hover:bg-accent/30"
                  }`}
                >
                  <ImageIcon className="w-3 h-3" />
                  Image
                </button>
                <button
                  onClick={() => setNewType("video")}
                  className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[11px] transition-colors ${
                    newType === "video"
                      ? "bg-purple-500/15 text-purple-400"
                      : "bg-secondary text-muted-foreground hover:bg-accent/30"
                  }`}
                >
                  <Video className="w-3 h-3" />
                  Video
                </button>
              </div>

              {/* Add button */}
              <button
                onClick={handleAdd}
                disabled={!newModelId.trim()}
                className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
