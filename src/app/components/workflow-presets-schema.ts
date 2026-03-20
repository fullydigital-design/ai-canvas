import type { WorkflowPreset } from "./workflow-presets-types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return isObject(value);
}

function isNodeLike(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isString(value.id) &&
    isString(value.class_type) &&
    isRecord(value.inputs)
  );
}

function isExposedParamLike(value: unknown): boolean {
  if (!isObject(value)) return false;
  return (
    isString(value.nodeId) &&
    isString(value.nodeClass) &&
    isString(value.fieldName) &&
    isString(value.label) &&
    isString(value.type) &&
    typeof value.order === "number"
  );
}

function isWorkflowDataLike(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (!isString(value.id) || !isString(value.name) || !isString(value.description)) {
    return false;
  }
  if (!Array.isArray(value.nodes) || !value.nodes.every(isNodeLike)) return false;
  if (!isRecord(value.rawJson)) return false;
  if (
    !Array.isArray(value.exposedParams) ||
    !value.exposedParams.every(isExposedParamLike)
  ) {
    return false;
  }
  return true;
}

export function validateWorkflowPreset(
  value: unknown,
): value is WorkflowPreset {
  if (!isObject(value)) return false;
  return (
    isString(value.id) &&
    isString(value.name) &&
    isString(value.description) &&
    isString(value.category) &&
    isString(value.icon) &&
    isBoolean(value.inputRequired) &&
    isBoolean(value.maskRequired) &&
    (value.inputNodeId === null || isString(value.inputNodeId)) &&
    (value.maskNodeId === null || isString(value.maskNodeId)) &&
    isWorkflowDataLike(value.workflow)
  );
}

export function validateWorkflowPresetsAtLoad(
  presets: readonly unknown[],
): { valid: WorkflowPreset[]; errors: string[] } {
  const shapeValid: WorkflowPreset[] = [];
  const errors: string[] = [];

  for (const preset of presets) {
    if (validateWorkflowPreset(preset)) {
      shapeValid.push(preset);
      continue;
    }
    const id = isObject(preset) && isString(preset.id) ? preset.id : "<unknown>";
    errors.push(`Invalid workflow preset shape: ${id}`);
  }

  const seenIds = new Set<string>();
  const valid: WorkflowPreset[] = [];
  for (const preset of shapeValid) {
    if (seenIds.has(preset.id)) {
      errors.push(`Duplicate workflow preset id: ${preset.id}`);
      continue;
    }
    seenIds.add(preset.id);
    valid.push(preset);
  }

  return { valid, errors };
}
