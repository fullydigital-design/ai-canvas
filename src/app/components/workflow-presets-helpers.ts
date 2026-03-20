import type { ComfyWorkflowData } from "./comfyui-workflow-modal";
import { WORKFLOW_PRESETS_DATA } from "./workflow-presets-data";
import { validateWorkflowPresetsAtLoad } from "./workflow-presets-schema";
import type {
  WorkflowPreset,
  WorkflowPresetCategory,
} from "./workflow-presets-types";

const presetValidation = validateWorkflowPresetsAtLoad(WORKFLOW_PRESETS_DATA);

if (presetValidation.errors.length > 0) {
  console.error(
    `[WorkflowPresets] ${presetValidation.errors.length} invalid preset issue(s) detected.`,
    presetValidation.errors,
  );
}

export const WORKFLOW_PRESETS: WorkflowPreset[] = presetValidation.valid;

export function getPresetsByCategory(category: WorkflowPresetCategory) {
  return WORKFLOW_PRESETS.filter((preset) => preset.category === category);
}

export function getWorkflowPresetById(id: string) {
  return WORKFLOW_PRESETS.find((preset) => preset.id === id) ?? null;
}

export function createWorkflowFromPreset(
  preset: WorkflowPreset,
): ComfyWorkflowData {
  return {
    ...preset.workflow,
    id: `${preset.id}-${Date.now()}`,
    rawJson: JSON.parse(JSON.stringify(preset.workflow.rawJson)),
    exposedParams: preset.workflow.exposedParams.map((param) => ({ ...param })),
    nodes: preset.workflow.nodes.map((node) => ({
      ...node,
      inputs: { ...node.inputs },
    })),
  };
}
