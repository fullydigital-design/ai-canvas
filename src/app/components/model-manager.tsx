/**
 * Model Manager — browse and organize models available on the ComfyUI server.
 * Reads from /object_info to discover checkpoints, VAEs, LoRAs, upscale models,
 * controlnets, and embeddings.
 */
import { useState, useEffect, useCallback } from "react";
import {
  LoaderCircle,
  RefreshCw,
  Search,
  Package,
  ChevronDown,
  ChevronRight,
  HardDrive,
  Cpu,
  Layers,
  Zap,
  Image as ImageIcon,
  Sparkles,
  X,
  Copy,
  Check,
} from "lucide-react";
import { getComfyClient } from "./comfyui-client";
import { useEditorSelector } from "./editor-store";

type ModelCategory = "checkpoints" | "loras" | "vae" | "upscale" | "controlnet" | "embeddings" | "clip";

interface ModelInfo {
  name: string;
  category: ModelCategory;
}

const CATEGORY_CONFIG: Record<
  ModelCategory,
  { label: string; icon: React.ElementType; color: string; nodeClass: string; inputField: string }
> = {
  checkpoints: { label: "Checkpoints", icon: HardDrive, color: "#3ECF8E", nodeClass: "CheckpointLoaderSimple", inputField: "ckpt_name" },
  loras: { label: "LoRAs", icon: Zap, color: "#f59e0b", nodeClass: "LoraLoader", inputField: "lora_name" },
  vae: { label: "VAE", icon: Cpu, color: "#8b5cf6", nodeClass: "VAELoader", inputField: "vae_name" },
  upscale: { label: "Upscale", icon: Sparkles, color: "#06b6d4", nodeClass: "UpscaleModelLoader", inputField: "model_name" },
  controlnet: { label: "ControlNet", icon: Layers, color: "#ec4899", nodeClass: "ControlNetLoader", inputField: "control_net_name" },
  embeddings: { label: "Embeddings", icon: ImageIcon, color: "#f97316", nodeClass: "Embedding", inputField: "embedding" },
  clip: { label: "CLIP", icon: Package, color: "#64748b", nodeClass: "CLIPLoader", inputField: "clip_name" },
};

interface ModelManagerProps {
  open: boolean;
  onClose: () => void;
}

export function ModelManager({ open, onClose }: ModelManagerProps) {
  const comfyuiUrl = useEditorSelector((s) => s.comfyuiUrl);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCategories, setExpandedCategories] = useState<Set<ModelCategory>>(
    new Set(["checkpoints"])
  );
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const copyModelName = (name: string) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(name).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = name;
      ta.style.cssText = "position:fixed;top:-9999px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch (_) {}
      document.body.removeChild(ta);
    }
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 1500);
  };

  const fetchModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getComfyClient(comfyuiUrl);
      const info = await client.getObjectInfo();

      const allModels: ModelInfo[] = [];

      for (const [category, config] of Object.entries(CATEGORY_CONFIG)) {
        const nodeInfo = info[config.nodeClass] as any;
        if (nodeInfo?.input?.required?.[config.inputField]) {
          const names: string[] = nodeInfo.input.required[config.inputField][0] || [];
          for (const name of names) {
            allModels.push({ name, category: category as ModelCategory });
          }
        }
      }

      setModels(allModels);
    } catch (err: any) {
      setError(err.message || "Failed to fetch models");
    }
    setLoading(false);
  }, [comfyuiUrl]);

  useEffect(() => {
    if (open) fetchModels();
  }, [open, fetchModels]);

  if (!open) return null;

  const filteredModels = searchQuery.trim()
    ? models.filter((m) =>
        m.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : models;

  const groupedModels = Object.keys(CATEGORY_CONFIG).reduce(
    (acc, cat) => {
      acc[cat as ModelCategory] = filteredModels.filter(
        (m) => m.category === cat
      );
      return acc;
    },
    {} as Record<ModelCategory, ModelInfo[]>
  );

  const toggleCategory = (cat: ModelCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const totalModels = models.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[560px] max-h-[80vh] bg-card border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Model Manager</span>
            <span className="text-xs text-muted-foreground">
              ({totalModels} models)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchModels}
              disabled={loading}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="px-4 py-2 border-b border-border">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search models..."
              className="w-full pl-7 pr-2 py-1.5 bg-secondary text-foreground text-xs rounded-md border border-border focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {loading && models.length === 0 && (
            <div className="flex items-center justify-center py-8 text-muted-foreground text-xs">
              <LoaderCircle className="w-4 h-4 animate-spin mr-2" />
              Loading models from ComfyUI...
            </div>
          )}

          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 text-xs text-destructive">
              {error}
              <div className="mt-1 text-destructive/60">
                Make sure ComfyUI is running and connected.
              </div>
            </div>
          )}

          {!loading && !error && models.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No models found. Connect to ComfyUI first.
            </div>
          )}

          {Object.entries(CATEGORY_CONFIG).map(([cat, config]) => {
            const catModels = groupedModels[cat as ModelCategory] || [];
            if (catModels.length === 0) return null;
            const Icon = config.icon;
            const isExpanded = expandedCategories.has(cat as ModelCategory);

            return (
              <div key={cat} className="rounded-md border border-border overflow-hidden">
                <button
                  onClick={() => toggleCategory(cat as ModelCategory)}
                  className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-muted-foreground" />
                  )}
                  <Icon className="w-3.5 h-3.5" style={{ color: config.color }} />
                  <span className="text-xs text-foreground">{config.label}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {catModels.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="divide-y divide-border">
                    {catModels.map((model) => (
                      <div
                        key={`${cat}-${model.name}`}
                        className="flex items-center gap-2 px-3 py-1.5 hover:bg-accent/20 transition-colors group"
                      >
                        <div
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="text-xs text-foreground truncate flex-1" title={model.name}>
                          {model.name}
                        </span>
                        <button
                          onClick={() => copyModelName(model.name)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-all"
                          title="Copy model name"
                        >
                          {copiedName === model.name ? (
                            <Check className="w-3 h-3 text-primary" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
          Models are read from your ComfyUI server. Place model files in the appropriate ComfyUI
          model directories to make them available here.
        </div>
      </div>
    </div>
  );
}
