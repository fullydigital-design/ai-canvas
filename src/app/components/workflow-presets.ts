/**
 * Workflow presets public surface.
 * Keeps backward-compatible imports while delegating to split modules.
 */

export type {
  WorkflowPreset,
  WorkflowPresetCategory,
} from "./workflow-presets-types";

export {
  WORKFLOW_PRESETS,
  createWorkflowFromPreset,
  getPresetsByCategory,
  getWorkflowPresetById,
} from "./workflow-presets-helpers";
