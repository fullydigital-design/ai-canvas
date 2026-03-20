import type { ComfyWorkflowData } from "./comfyui-workflow-modal";

export type WorkflowPresetCategory =
  | "generate"
  | "transform"
  | "inpaint"
  | "enhance";

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  category: WorkflowPresetCategory;
  icon: string;
  inputRequired: boolean;
  maskRequired: boolean;
  workflow: ComfyWorkflowData;
  inputNodeId: string | null;
  maskNodeId: string | null;
}
