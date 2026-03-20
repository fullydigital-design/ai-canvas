# Phase 8a Baseline and Guardrails

Date: 2026-03-14
Status: Complete

## Objective
Set a stable baseline before decomposition so Phase 8 refactors reduce risk instead of moving bugs around.

## Baseline: High-Risk Files (Current Size)

| Priority | File | Lines | Primary Risk |
| --- | --- | ---: | --- |
| P1 | `src/app/components/infinite-canvas.tsx` | 1416 | Mixed input/render/tool logic causing high regression chance |
| P1 | `src/app/components/comfyui-connect-panel.tsx` | 1082 | Connection state, queue/run flow, and UI tightly coupled |
| P1 | `src/app/components/comfyui-workflow-modal.tsx` | 1019 | Workflow CRUD, editor, and validation mixed in one module |
| P2 | `src/app/components/workflow-presets.tsx` | 753 | Preset data + UI helpers + behavior logic are coupled |
| P2 | `src/app/components/image-processing.worker.ts` | 724 | Multiple operation handlers in one worker entry file |

## Extraction Targets (Phase 8b-8e)

### 8b: `infinite-canvas.tsx`
- `canvas-interactions/handle-pointer.ts`
- `canvas-interactions/handle-wheel.ts`
- `hooks/use-selection-interactions.ts`
- `hooks/use-crop-interactions.ts`

### 8c: ComfyUI files
- `comfyui/hooks/use-comfyui-connection.ts`
- `comfyui/components/comfyui-run-controls.tsx`
- `comfyui/components/comfyui-endpoint-settings.tsx`
- `comfyui/workflow/workflow-validation.ts`
- `comfyui/workflow/workflow-import-export.ts`

### 8d: Worker decomposition
- `worker/ops/flatten.ts`
- `worker/ops/extract.ts`
- `worker/ops/adjustments.ts`
- `worker/shared/image-ops.ts`

### 8e: Presets decomposition
- `workflow/presets-data.ts`
- `workflow/presets-schema.ts`
- `workflow/presets-ui-helpers.ts`

## Phase 8 Guardrail Smoke Checks
Source of truth: `docs/TESTING_CHECKLIST.md` (Phase 8 section)

Required checks after each extraction slice:
- zoom/pan + wheel behavior
- crop preview/apply behavior
- selection tools behavior
- export and save/load project behavior
- ComfyUI connect + run behavior

## Exit Criteria for Phase 8a
- Baseline file-size inventory captured.
- Extraction map defined for 8b-8e.
- Guardrail checklist added and available for every slice.
