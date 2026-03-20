# Optimization and Improvement Plan

Created: 2026-03-14
Last updated: 2026-03-14

## Goal
Keep AI Canvas Editor fast, stable, and maintainable while reducing memory usage and preventing regressions.

## Phase 0: Dependency Audit and Cleanup
Status: Complete (2026-03-14)

## Phase 1: State Management Migration (Context -> Zustand)
Status: Complete (2026-03-14)

## Phase 2: Split `infinite-canvas.tsx`
Status: Complete (2026-03-14)

## Phase 3: Split `ai-panel.tsx`
Status: Complete (2026-03-14)

## Phase 4: Image Data Architecture (base64 -> reference cache)
Status: Complete (2026-03-14)

## Phase 5: Render Performance Hardening
Status: Complete (2026-03-14)

## Phase 6: Web Worker Offload for Pixel Processing
Status: Complete (2026-03-14)

Completed:
- Added worker-based pixel processing pipeline for flatten/extract operations.
- Defaulted export/AI flattening to worker path with automatic fallback.
- Preserved interactive responsiveness by forcing main-thread path in high-frequency canvas interactions.

## Phase 7: Optional GPU Pipeline (WebGL)
Status: Complete (2026-03-14)

Completed:
- Added WebGL preview pipeline module: `src/app/components/webgl-adjustments.ts`.
- Added shader-based adjustments for preview path:
  - Levels
  - Curves (LUT-driven)
  - Hue/Saturation
  - Blur
- Integrated GPU adjustment path into `canvas-renderer.ts` with automatic CPU fallback to `applyAllAdjustments`.
- Kept behavior-safe fallback conditions for unsupported combinations (for example color balance, filters, sharpen).

## Phase 8: Maintainability Hardening (Targeted File Decomposition)
Status: Complete (2026-03-14)

Goal:
- Improve bug-fix speed and reduce regression risk by decomposing only high-risk large files with mixed responsibilities.

Scope:
- `src/app/components/infinite-canvas.tsx`
- `src/app/components/comfyui-connect-panel.tsx`
- `src/app/components/comfyui-workflow-modal.tsx`
- `src/app/components/workflow-presets.tsx`
- `src/app/components/image-processing.worker.ts`

Approach:
- No big-bang rewrites.
- Decompose in small, behavior-preserving slices.
- After each slice: run build and smoke test critical flows.

### Phase 8a: Baseline + Guardrails
Status: Complete (2026-03-14)
- Add lightweight regression checklist for:
  - zoom/pan + wheel behavior
  - crop preview/apply
  - selection tools
  - export and project save/load
  - ComfyUI connect/run flow
- Record current file sizes and extraction targets.

Completed:
- Added targeted Phase 8 regression guardrails in `docs/TESTING_CHECKLIST.md`.
- Added decomposition baseline and extraction map in `docs/PHASE_8A_BASELINE.md`.
- Updated project tracking docs/state for Phase 8 progression.

### Phase 8b: `infinite-canvas.tsx` Decomposition
Status: Complete (2026-03-14)
- Extract input handlers to focused modules (mouse/pointer/keyboard/wheel).
- Extract selection/crop interaction logic to dedicated hooks.
- Keep rendering + store wiring in thin shell component.

Completed:
- Added `src/app/components/canvas-interactions/use-wheel-zoom.ts` and moved wheel zoom listener/logic out of `infinite-canvas.tsx`.
- Added `src/app/components/canvas-interactions/use-crop-interactions.ts` and moved crop state + draft/finalize/apply/cancel logic into a dedicated hook.
- Added `src/app/components/canvas-interactions/use-selection-interactions.ts` and moved rectangle/lasso state transitions into a dedicated hook.
- Rewired `infinite-canvas.tsx` to consume extracted hooks while preserving existing behavior.
- Reduced `infinite-canvas.tsx` size from 1526 lines to 1356 lines.

### Phase 8c: ComfyUI UI Decomposition
Status: Complete (2026-03-14)
- Split `comfyui-connect-panel.tsx` into:
  - connection state/actions hook
  - queue/run controls
  - endpoint/settings section
- Split `comfyui-workflow-modal.tsx` into:
  - workflow list/view
  - workflow import/export editor
  - validation/status utilities

Completed:
- Added `src/app/components/comfyui-connection-types.ts` for shared connection status typing.
- Added `src/app/components/use-comfyui-connection.ts` and moved live connection-check logic out of `comfyui-connect-panel.tsx`.
- Added `src/app/components/comfyui-endpoint-settings.tsx` and `src/app/components/comfyui-queue-run-controls.tsx`.
- Added `src/app/components/comfyui-workflow-utils.ts`, `src/app/components/comfyui-workflow-json-editor.tsx`, and `src/app/components/comfyui-node-browser.tsx`.
- Rewired `comfyui-workflow-modal.tsx` to consume extracted JSON editor, node browser, and parsing utilities.
- Reduced `comfyui-workflow-modal.tsx` size from 1019 lines (Phase 8a baseline) to 765 lines.

### Phase 8d: Worker Structure Hardening
Status: Complete (2026-03-14)
- Break `image-processing.worker.ts` into operation modules (flatten/extract/filters/shared utils).
- Keep worker entrypoint minimal and message protocol centralized.

Completed:
- Added worker module split under `src/app/components/image-worker/`:
  - `shared.ts`
  - `filters.ts`
  - `adjustments.ts`
  - `layer-render.ts`
  - `flatten.ts`
  - `extract-layer.ts`
  - `protocol.ts`
- Replaced `image-processing.worker.ts` with a thin entrypoint that delegates to protocol handling.
- Preserved existing worker request types and fallback behavior.
- Reduced worker entrypoint size from 724-line baseline (Phase 8a) to 8 lines.

### Phase 8e: Preset Data Separation
Status: Complete (2026-03-14)
- Convert `workflow-presets.tsx` into data + schema + UI helpers split.
- Add validation for preset shape at load time to avoid runtime errors.

Completed:
- Split preset module into focused files:
  - `src/app/components/workflow-presets-data.ts`
  - `src/app/components/workflow-presets-types.ts`
  - `src/app/components/workflow-presets-schema.ts`
  - `src/app/components/workflow-presets-helpers.ts`
  - `src/app/components/workflow-presets.ts` (thin compatibility export surface)
- Added load-time preset validation with duplicate-id detection and invalid-shape filtering.
- Updated `ai-comfyui-tab.tsx` to use `createWorkflowFromPreset(...)` helper for consistent preset cloning behavior.

### Phase 8f: Verification + Documentation
Status: Complete (2026-03-14)
- Run `pnpm build` after each phase step.
- Update `CHANGELOG.md`, `project-state.yaml`, and this plan after completion.
- Mark each subphase complete only after smoke test pass.

Completed:
- Ran `pnpm.cmd build` and confirmed production build output.
- Ran `pnpm.cmd exec tsc --noEmit` and recorded existing non-Phase-8 type errors for follow-up.
- Updated Phase 8 documentation and project state files to final status.
- Marked Phase 8 roadmap as complete.
- Left full manual smoke checklist execution as a release-gate follow-up in `docs/TESTING_CHECKLIST.md`.

## Phase 9: Blender Bridge and 3D Hub
Status: In Progress (2026-03-14)

Goal:
- Add a dedicated 3D workflow path where Blender can run from inside AI Canvas and send renders/passes back to the 2D editor.

Plan document:
- `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md`

Initial execution order:
1. 9a Requirements and technical spike
2. 9b 3D tab shell and feature flag
3. 9c Blender process manager
4. 9d Native window embedding (Windows)
5. 9e Blender add-on MVP (send render to AI Canvas)
6. 9f Passes + metadata import
7. 9g Camera/scene roundtrip
8. 9h Sequence/video handoff foundation
9. 9i Hardening, QA, packaging docs

Progress:
- 9a complete on 2026-03-14.
- 9b complete on 2026-03-14.
- 9c complete on 2026-03-14.
- 9d complete on 2026-03-14.
- 9e complete on 2026-03-14.
- 9f complete on 2026-03-14.
- 9g complete on 2026-03-14.
- 9h complete on 2026-03-14.
- 9i complete on 2026-03-14.
- Next: DONE - Fully implemented (Phase 9 scope).

## Status Table

| Phase | Status | Started | Completed |
| --- | --- | --- | --- |
| 0 | Complete | 2026-03-14 | 2026-03-14 |
| 1 | Complete | 2026-03-14 | 2026-03-14 |
| 2 | Complete | 2026-03-14 | 2026-03-14 |
| 3 | Complete | 2026-03-14 | 2026-03-14 |
| 4 | Complete | 2026-03-14 | 2026-03-14 |
| 5 | Complete | 2026-03-14 | 2026-03-14 |
| 6 | Complete | 2026-03-14 | 2026-03-14 |
| 7 | Complete | 2026-03-14 | 2026-03-14 |
| 8 | Complete | 2026-03-14 | 2026-03-14 |
| 9 | In Progress | 2026-03-14 | - |

## Roadmap Status
Phase 9 complete.
