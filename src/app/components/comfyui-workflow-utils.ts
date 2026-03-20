import type { ComfyNode, ComfyWorkflowData } from "./comfyui-workflow-modal";

export type WorkflowParamType =
  | "slider"
  | "number"
  | "text"
  | "select"
  | "seed"
  | "toggle";

const NODE_ICONS: Record<string, string> = {
  KSampler: "⚡",
  CheckpointLoaderSimple: "🔄",
  CLIPTextEncode: "📝",
  EmptyLatentImage: "🖼️",
  VAEDecode: "🎨",
  SaveImage: "💾",
  LoraLoader: "🔗",
  VAELoader: "🔧",
  ControlNetLoader: "🎛️",
  ControlNetApply: "🎯",
  ImageScale: "📐",
  ImageUpscaleWithModel: "🔎",
};

export function getNodeIcon(classType: string) {
  return NODE_ICONS[classType] || "📦";
}

export function isConnection(value: unknown): boolean {
  return (
    Array.isArray(value) && value.length === 2 && typeof value[0] === "string"
  );
}

export function guessParamType(
  fieldName: string,
  value: unknown
): {
  type: WorkflowParamType;
  min?: number;
  max?: number;
  step?: number;
} {
  const name = fieldName.toLowerCase();
  if (name === "seed") return { type: "seed" };
  if (name === "steps" || name === "quality_steps")
    return { type: "slider", min: 1, max: 100, step: 1 };
  if (name === "cfg" || name === "cfg_scale" || name.includes("adherence"))
    return { type: "slider", min: 1, max: 30, step: 0.5 };
  if (name === "denoise" || name === "strength")
    return { type: "slider", min: 0, max: 1, step: 0.01 };
  if (name === "width" || name === "height")
    return { type: "slider", min: 64, max: 4096, step: 64 };
  if (
    name === "sampler_name" ||
    name === "scheduler" ||
    name === "ckpt_name" ||
    name === "lora_name" ||
    name === "vae_name" ||
    name === "control_net_name" ||
    name === "upscale_method"
  )
    return { type: "select" };
  if (typeof value === "boolean") return { type: "toggle" };
  if (typeof value === "number") return { type: "number" };
  return { type: "text" };
}

function getSamplerOptions() {
  return [
    "euler",
    "euler_ancestral",
    "heun",
    "heunpp2",
    "dpm_2",
    "dpm_2_ancestral",
    "lms",
    "dpm_fast",
    "dpm_adaptive",
    "dpmpp_2s_ancestral",
    "dpmpp_sde",
    "dpmpp_sde_gpu",
    "dpmpp_2m",
    "dpmpp_2m_sde",
    "dpmpp_2m_sde_gpu",
    "dpmpp_3m_sde",
    "dpmpp_3m_sde_gpu",
    "ddpm",
    "lcm",
    "ddim",
    "uni_pc",
    "uni_pc_bh2",
  ];
}

function getSchedulerOptions() {
  return [
    "normal",
    "karras",
    "exponential",
    "sgm_uniform",
    "simple",
    "ddim_uniform",
    "beta",
  ];
}

export function getDefaultOptions(fieldName: string): string[] | undefined {
  const name = fieldName.toLowerCase();
  if (name === "sampler_name") return getSamplerOptions();
  if (name === "scheduler") return getSchedulerOptions();
  return undefined;
}

export function parseWorkflowJson(json: Record<string, unknown>): ComfyNode[] {
  const nodes: ComfyNode[] = [];
  for (const [id, nodeData] of Object.entries(json)) {
    const nd = nodeData as Record<string, unknown>;
    if (nd.class_type && nd.inputs) {
      nodes.push({
        id,
        class_type: nd.class_type as string,
        inputs: nd.inputs as Record<string, unknown>,
      });
    }
  }
  return nodes;
}

export function parseWorkflowText(
  text: string,
  workflowName: string
): { workflow: ComfyWorkflowData | null; error: string | null } {
  try {
    const json = JSON.parse(text);
    const nodes = parseWorkflowJson(json);
    if (nodes.length === 0) {
      return { workflow: null, error: "No valid ComfyUI nodes found in JSON." };
    }

    const name = workflowName || `Workflow ${Date.now().toString(36)}`;
    const workflow: ComfyWorkflowData = {
      id: `wf-${Date.now()}`,
      name,
      description: `${nodes.length} nodes`,
      nodes,
      rawJson: json,
      exposedParams: [],
    };
    return { workflow, error: null };
  } catch {
    return {
      workflow: null,
      error: "Invalid JSON. Please paste a valid ComfyUI API JSON.",
    };
  }
}
