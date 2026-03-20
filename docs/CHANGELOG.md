# Changelog

## 2026-03-20 - GitHub repo prep + upload/download helpers

### Added
- `README.md` initialized for GitHub with project heading.
- `git_upload.bat` root helper:
  - stages all changes
  - commits with optional custom message
  - auto-sets local `user.name` / `user.email` defaults if missing
  - ensures `origin` points to `https://github.com/fullydigital-design/ai-canvas.git`
  - ensures branch `main`
  - retries push after GitHub browser auth when needed
  - pushes to `origin/main`.
- `git_download.bat` root helper:
  - ensures clean working tree before sync
  - ensures `origin` points to `https://github.com/fullydigital-design/ai-canvas.git`
  - fetches and fast-forward pulls latest `main`.
- `github_login.bat` helper:
  - configures Git Credential Manager
  - opens browser-based GitHub login popup (`git credential-manager github login --browser`).
- Compatibility wrappers restored:
  - `git_push.bat` -> calls `git_upload.bat`
  - `git_pull_latest.bat` -> calls `git_download.bat`

---

## 2026-03-20 - Dev launcher hardening: prevent wrong app on occupied port

### Added
- `scripts/electron-dev-launch.cjs`
  - starts Vite first and waits until the served HTML matches AI Canvas (`<title>AI Canvas Editor</title>`)
  - launches Electron only after AI Canvas dev server readiness is confirmed
  - exits early with a clear message when port `5173` is occupied by another app.

### Changed
- `package.json`
  - `dev` now uses a fixed strict port: `vite --host 127.0.0.1 --port 5173 --strictPort`
  - `electron:dev` now uses the new hardened launcher script instead of generic `wait-on`.
- `scripts/electron-dev-launch.cjs`
  - clears `ELECTRON_RUN_AS_NODE` from child process environments to prevent Electron from booting in Node mode.

---

## 2026-03-14 - Phase 9i complete: hardening, QA, packaging

### Added
- Release runbook: `docs/RELEASE_RUNBOOK.md`
  - pre-release validation flow
  - portable build and artifact validation
  - Blender add-on release checks
  - post-build documentation update checklist.

### Changed
- `electron/blender-process-manager.cjs`
  - added persisted managed-process record (`lastManagedProcess`) in process config
  - added startup stale-process recovery path with safe validation (process name/path/start-time checks)
  - added Windows stale-process cleanup attempt for abnormal prior session exits
  - exposes recovery note via process state.
- `src/app/components/blender-3d-panel.tsx`
  - displays stale-process recovery note in process status card.
- `src/electron.d.ts`
  - extended `BlenderProcessState` with optional `lastRecoveryNote`.
- `docs/TESTING_CHECKLIST.md`
  - expanded with full Phase 9i hardening/fallback/release-gate smoke checks.
- `docs/KNOWN_ISSUES.md`
  - documented current 9i limitations (Windows-only stale cleanup path, manual QA release gate).
- `docs/PROJECT_STATUS.md`, `docs/OPTIMIZATION_PLAN.md`, `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md`, `project-state.yaml`
  - marked Phase 9 as complete (`9a` through `9i`).

### Validation
- `pnpm.cmd build` passed.
- `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passed.
- `node -e "require('./electron/blender-process-manager.cjs')"` passed.
- startup stale-recovery dry-run behaved safely (`node.exe` mismatch skipped cleanup).

---

## 2026-03-14 - Phase 9h complete: sequence/video handoff foundation

### Added
- Sequence routes in `electron/blender-bridge-server.cjs`:
  - `POST /v1/sequence/import`
  - `GET /v1/sequence/list`
- Lazy sequence frame resolver in bridge server:
  - `getSequenceFrameData(sequenceId, frameIndex)` reads frame on-demand and caches data URL.
- Electron IPC + renderer events for sequences:
  - `blender-bridge-get-sequences`
  - `blender-bridge-get-sequence-frame`
  - renderer event `blender-bridge-sequence`
- Timeline data model store:
  - `src/app/components/blender-sequence-store.ts`
  - tracks clips, active sequence/frame, and per-frame preview state (`idle/loading/ready/error`).
- Blender add-on sequence handoff:
  - `Send Sequence Frames` operator in `blender_addon/ai_canvas_bridge_addon.py`
  - sequence settings: directory, glob pattern, FPS, start frame.

### Changed
- `electron/main.cjs`
  - forwards sequence import events to renderer
  - exposes sequence summary/frame IPC handlers
- `electron/preload.cjs`
  - adds sequence API methods and event subscription
- `src/electron.d.ts`
  - adds sequence payload/frame typings and sequence bridge API methods
- `src/app/components/blender-3d-panel.tsx`
  - adds Sequence Handoff panel UI:
    - sequence selection
    - frame scrubber + prev/next controls
    - lazy frame preview loading
    - import current frame to 2D canvas as a new layer
- `blender_addon/ai_canvas_bridge_addon.py`
  - version bumped to `0.4.0`
  - panel now includes sequence handoff controls

### Validation
- `pnpm.cmd build` passed.
- `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passed.

---

## 2026-03-14 - Phase 9g complete: camera/scene roundtrip MVP

### Added
- Camera roundtrip routes in `electron/blender-bridge-server.cjs`:
  - `POST /v1/camera/snapshot`
  - `GET /v1/camera/pending` (supports `?consume=1`)
  - `POST /v1/camera/states/import`
- Camera IPC surface:
  - `blender-bridge-set-camera-snapshot`
  - `blender-bridge-get-camera-state`
  - renderer event `blender-bridge-camera-states`
- Blender add-on camera operators in `blender_addon/ai_canvas_bridge_addon.py`:
  - `Push Camera States`
  - `Pull Camera Snapshot`

### Changed
- `electron/main.cjs`
  - forwards imported camera states to renderer via `blender-bridge-camera-states`
  - exposes camera bridge IPC handlers
- `electron/preload.cjs`
  - adds camera bridge methods and camera-states subscription callback
- `src/electron.d.ts`
  - adds `BlenderCameraSnapshot`, camera-state message typing, and new bridge API typings
- `src/app/components/blender-3d-panel.tsx`
  - adds Camera Roundtrip panel UI:
    - snapshot editor fields (camera/frame/lens/location/rotation/resolution)
    - send snapshot action
    - pending snapshot diagnostics
    - imported camera states list with load action
- `docs/BLENDER_BRIDGE_IPC.md`
  - camera route contract documented
- `docs/BLENDER_ADDON_SETUP.md`
  - camera workflow instructions added

### Validation
- `pnpm.cmd build` passed.
- `node -e "require('./electron/blender-bridge-server.cjs')"` state helper sanity check passed.

---

## 2026-03-14 - Phase 9f complete: passes + metadata pipeline

### Added
- Multi-pass bridge payload support in `electron/blender-bridge-server.cjs`:
  - `POST /v1/render/import` now accepts single or multi-pass payloads
  - `POST /v1/render/import-pass-set` alias route
  - pass entry parsing for `passes[]` and `passFiles{}`
  - metadata sidecar merge support via `metadataPath`
- Blender add-on pass-set workflow in `blender_addon/ai_canvas_bridge_addon.py`:
  - `Send Render + Passes` operator
  - optional pass file pickers (depth/normal/albedo/object ID/material ID)
  - seed override metadata field

### Changed
- `src/app/App.tsx`
  - bridge import handler now supports pass sets
  - pass layers are imported in one history action and grouped by `blenderGroupId`
  - metadata is attached to imported layers (`sourceMetadata`)
- `src/app/components/editor-store.tsx`
  - added layer fields for Blender pass/group metadata:
    - `blenderImportId`, `blenderGroupId`, `blenderGroupName`, `blenderPassType`, `sourceMetadata`
- `src/app/components/layers-panel.tsx`
  - renders Blender group headers in layer list
  - renders pass badges per layer
  - displays source metadata in Layer Properties
- `src/app/components/project-io.tsx`
  - added load/save compatibility for Blender pass/group metadata fields
- `src/electron.d.ts`
  - extended bridge import typings for `passes`, `passSetId`, metadata schema
  - extended bridge state typings with pass summary fields
- `src/app/components/blender-3d-panel.tsx`
  - bridge diagnostics now show last imported pass count/types

### Validation
- `pnpm.cmd build` passed.
- `node -e "require('./electron/blender-bridge-server.cjs')"` passed.

---

## 2026-03-14 - Phase 9e complete: Blender add-on MVP + bridge import

### Added
- `electron/blender-bridge-server.cjs`
  - local loopback bridge server (`127.0.0.1:8765`)
  - `GET /health`
  - `POST /v1/render/import`
  - payload/file validation + bridge state metrics
- `blender_addon/ai_canvas_bridge_addon.py`
  - Blender panel in `View3D > Sidebar > AI Canvas`
  - `Test Bridge`
  - `Send Viewport Snapshot`
  - `Send Final Render`
- `docs/BLENDER_ADDON_SETUP.md`
  - install + usage instructions for add-on workflow

### Changed
- `electron/main.cjs`
  - starts bridge server at app startup
  - stops bridge server during app quit cleanup
  - forwards bridge imports to renderer via `blender-bridge-import`
  - adds IPC handler `blender-bridge-get-state`
- `electron/preload.cjs`
  - adds `blenderBridgeGetState`
  - adds `onBlenderBridgeImport` subscription API
- `src/electron.d.ts`
  - adds bridge state and bridge import payload typings
- `src/app/App.tsx`
  - listens for bridge import events
  - imports incoming render into a new top image layer
  - activates imported layer and switches to `Layers` tab
- `src/app/components/blender-3d-panel.tsx`
  - displays bridge endpoint/status/import metrics

### Validation
- `pnpm.cmd build` passed.

---

## 2026-03-14 - Phase 9d complete: native window embedding integration

### Added
- `electron/blender-embed-manager.cjs`
  - native attach/sync/focus/detach orchestration for embedded Blender window
  - embed state tracking and recovery on process exit
- New embed IPC handlers in `electron/main.cjs`:
  - `blender-embed-get-state`
  - `blender-embed-attach`
  - `blender-embed-sync-bounds`
  - `blender-embed-focus`
  - `blender-embed-detach`
- New preload bridge APIs in `electron/preload.cjs` for embed controls.

### Changed
- `scripts/win-window-parent.ps1`
  - added `position` mode for fast move/resize updates
  - added `focus` mode for focus sync
- `electron/blender-process-manager.cjs`
  - added process-exit listener hook
  - added explicit status setter used by embed lifecycle
- `electron/main.cjs`
  - integrated process-exit -> embed reset handling
  - detach embed during stop/restart flows
  - app quit path now cleans embed/process state together
- `src/electron.d.ts`
  - added embed manager API typings and `BlenderEmbedState`
- `src/app/components/blender-3d-panel.tsx`
  - added real embedded host area
  - attach/detach controls
  - auto bounds sync on resize/layout changes
  - click-to-focus behavior
  - recovery-aware status handling
- Tracking docs/state updated:
  - `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md` (9d marked complete)
  - `docs/OPTIMIZATION_PLAN.md` (next = 9e)
  - `docs/PROJECT_STATUS.md`
  - `docs/ARCHITECTURE.md`
  - `project-state.yaml`

### Validation
- `pnpm.cmd build` passed.
- Node module load check passed for embed/process managers.

---

## 2026-03-14 - Phase 9c complete: Blender process manager

### Added
- `electron/blender-process-manager.cjs`
  - Blender executable path persistence (`userData/blender-config.json`)
  - executable validation with spawn timeout (`--version`)
  - process lifecycle API (start/stop/restart)
  - watchdog for stale/orphan process-state recovery
- Electron IPC handlers in `electron/main.cjs`:
  - `blender-process-get-state`
  - `blender-process-set-path`
  - `blender-process-validate-path`
  - `blender-process-start`
  - `blender-process-stop`
  - `blender-process-restart`
- Preload bridge methods in `electron/preload.cjs` for all Blender process operations.

### Changed
- `electron/main.cjs`
  - initialized Blender process manager on app startup
  - added `before-quit` graceful Blender shutdown flow
- `src/electron.d.ts`
  - extended `window.electronAPI` typings for Blender process manager APIs
- `src/app/components/blender-3d-panel.tsx`
  - replaced placeholder state with real process-manager integration
  - added path save/clear/validate controls
  - added Start / Stop / Restart actions
  - added live process diagnostics (PID/version/running/status)
- Tracking docs/state:
  - `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md` (9c marked complete)
  - `docs/OPTIMIZATION_PLAN.md` (next = 9d)
  - `docs/PROJECT_STATUS.md`
  - `docs/ARCHITECTURE.md`
  - `project-state.yaml`

### Validation
- `pnpm.cmd build` passed.

---

## 2026-03-14 - Phase 9b complete: 3D tab shell + feature flag

### Added
- `src/app/components/feature-flags.ts`
  - `VITE_ENABLE_3D_TAB` support
  - local runtime override key `aiCanvas.flags.blender3dTab`
- `src/app/components/blender-3d-panel.tsx`:
  - Blender integration state shell
  - state model coverage:
    - `Not installed`
    - `Ready`
    - `Launching`
    - `Embedded`
    - `Detached`
    - `Error`
  - in-panel spike action via `electronAPI.runBlenderEmbedSpike()`

### Changed
- `src/app/App.tsx`
  - Added `3D` right-side tab (feature-flag gated)
  - Added lazy-loading for Blender 3D shell panel
  - Added safe fallback to `Adjust` tab when 3D flag is disabled
- Tracking docs/state updated:
  - `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md` (9b marked complete)
  - `docs/OPTIMIZATION_PLAN.md` (next = 9c)
  - `docs/PROJECT_STATUS.md` (current phase updated)
  - `project-state.yaml` (phase_9b complete)
  - `docs/ARCHITECTURE.md` (3D shell modules listed)

### Validation
- `pnpm.cmd build` passed.

---

## 2026-03-14 - Phase 9a complete: Blender bridge requirements + embedding spike

### Added
- `docs/BLENDER_EMBEDDING_DECISION.md`
- `docs/BLENDER_BRIDGE_IPC.md`
- `docs/BLENDER_BRIDGE_RISK_LOG.md`
- `scripts/win-window-parent.ps1` (Win32 attach/detach helper)
- `electron/blender-embed-spike.cjs` (Notepad-based embed lifecycle spike)

### Changed
- `electron/main.cjs`
  - Added Help menu action: `Run Blender Embed Spike (Notepad)`.
  - Added IPC handler: `run-blender-embed-spike`.
- `electron/preload.cjs`
  - Added bridge method: `runBlenderEmbedSpike`.
- `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md`
  - Marked 9a complete and set next step to 9b.
- `docs/OPTIMIZATION_PLAN.md`, `docs/PROJECT_STATUS.md`, and `project-state.yaml`
  - Updated to Phase 9 in-progress tracking with 9a complete.

### Notes
- Spike validates attach/detach flow using a safe proxy process (Notepad) on Windows.
- Blender-specific embedding hardening remains in upcoming phases (9b+).

---

## 2026-03-14 - Phase 9 planning added: Blender Bridge and 3D Hub roadmap

### Added
- `docs/PHASE_9_BLENDER_BRIDGE_PLAN.md` with end-to-end subphase roadmap:
  - 9a requirements/spike
  - 9b 3D tab shell
  - 9c process manager
  - 9d native embedding
  - 9e Blender add-on MVP
  - 9f passes/metadata
  - 9g camera roundtrip
  - 9h sequence foundation
  - 9i hardening/release

### Changed
- `docs/OPTIMIZATION_PLAN.md` updated with new Phase 9 (planned) and next step `9a`.
- `docs/PROJECT_STATUS.md` updated to Phase 9 planning state.
- `project-state.yaml` updated to `phase_9_planned` with phase-9 tracking fields.

---

## 2026-03-14 - Phase 8f complete: final verification + documentation closeout

### Changed
- Finalized Phase 8 tracking status across plan/state documents.
- Closed Maintainability Hardening roadmap as complete.
- Updated `docs/KNOWN_ISSUES.md` with current TypeScript no-emit failures to track follow-up work.

### Validation
- `pnpm.cmd build` passed.
- `pnpm.cmd exec tsc --noEmit` run completed with existing non-Phase-8 errors still open in:
  - `src/app/components/adjustments-panel.tsx`
  - `src/app/components/ai-panel.tsx`
  - `src/app/components/header-bar.tsx`

---

## 2026-03-14 - Phase 8e complete: preset data separation + validation

### Added
- `src/app/components/workflow-presets-data.ts`
- `src/app/components/workflow-presets-types.ts`
- `src/app/components/workflow-presets-schema.ts`
- `src/app/components/workflow-presets-helpers.ts`
- `src/app/components/workflow-presets.ts` (compatibility export surface)

### Changed
- Split monolithic preset responsibilities into data, schema validation, and UI-facing helpers.
- Added load-time preset shape validation + duplicate-id detection to avoid runtime preset failures.
- `ai-comfyui-tab.tsx` now uses `createWorkflowFromPreset(...)` instead of inline clone logic.

### Validation
- `pnpm.cmd build` passed.

---

## 2026-03-14 - Phase 8d complete: worker structure hardening

### Added
- `src/app/components/image-worker/shared.ts`
- `src/app/components/image-worker/filters.ts`
- `src/app/components/image-worker/adjustments.ts`
- `src/app/components/image-worker/layer-render.ts`
- `src/app/components/image-worker/flatten.ts`
- `src/app/components/image-worker/extract-layer.ts`
- `src/app/components/image-worker/protocol.ts`

### Changed
- `src/app/components/image-processing.worker.ts` is now a thin entrypoint that delegates request handling.
- Worker operations are split by responsibility (shared utils, filters, adjustments, flatten, extract, protocol).
- Worker entrypoint reduced from 724 baseline lines to 8 lines.

### Validation
- `pnpm.cmd build` passed.
- Worker chunk emitted: `10.47 kB`.

---

## 2026-03-14 - Phase 8c complete: ComfyUI UI decomposition

### Added
- `src/app/components/comfyui-connection-types.ts`
- `src/app/components/use-comfyui-connection.ts`
- `src/app/components/comfyui-endpoint-settings.tsx`
- `src/app/components/comfyui-queue-run-controls.tsx`
- `src/app/components/comfyui-workflow-utils.ts`
- `src/app/components/comfyui-workflow-json-editor.tsx`
- `src/app/components/comfyui-node-browser.tsx`

### Changed
- `comfyui-connect-panel.tsx` now delegates connection state/testing and endpoint/queue sections to extracted modules.
- `comfyui-workflow-modal.tsx` now delegates JSON import/parse UI and node browsing UI to extracted components.
- `comfyui-workflow-modal.tsx` reduced from 1019 lines (Phase 8a baseline) to 765 lines.

### Validation
- `pnpm.cmd build` passed.

---

## 2026-03-14 - Phase 8b complete: `infinite-canvas` interaction decomposition

### Added
- `src/app/components/canvas-interactions/use-wheel-zoom.ts`
- `src/app/components/canvas-interactions/use-crop-interactions.ts`
- `src/app/components/canvas-interactions/use-selection-interactions.ts`

### Changed
- `infinite-canvas.tsx` now delegates wheel, crop, and selection/lasso interaction state transitions to dedicated hooks.
- Crop confirm overlay actions now use extracted crop hook handlers (`applyCrop`, `cancelCrop`).
- `infinite-canvas.tsx` reduced from 1526 lines to 1356 lines.

### Validation
- `cmd /c pnpm build` passed.

---

## 2026-03-14 - Phase 8a complete: baseline + guardrails

### Added
- `docs/PHASE_8A_BASELINE.md` with:
  - high-risk file size baseline
  - extraction targets for phases 8b-8e
  - exit criteria for decomposition baseline

### Changed
- `docs/TESTING_CHECKLIST.md` expanded with Phase 8 guardrail smoke checks:
  - canvas interaction (zoom/pan/wheel)
  - crop preview/apply
  - selection tools
  - save/load/export
  - ComfyUI connect/run/import-export
- `docs/OPTIMIZATION_PLAN.md` updated:
  - Phase 8 set to In Progress
  - Phase 8a marked Complete
  - roadmap status set to "Phase 8a complete, next: 8b"

---

## 2026-03-14 - Phase 7 complete: GPU preview pipeline (WebGL)

### Added
- `src/app/components/webgl-adjustments.ts` for shader-based preview adjustments.

### Changed
- `canvas-renderer.ts` now attempts WebGL preview processing for supported adjustments:
  - levels
  - curves (LUT-driven)
  - hue/saturation
  - blur
- Unsupported or unavailable GPU cases fall back to CPU `applyAllAdjustments` path.
- Updated architecture/status/performance/profiling docs and project state to mark roadmap completion.

### Validation
- `cmd /c pnpm build` passed.
- Entry JS: `277.35 kB` (`84.42 kB` gzip).

---

## 2026-03-14 - Phase 6 complete: worker offload for pixel processing

### Added
- `src/app/components/image-processing.worker.ts` for worker-side compositing/adjustment processing.
- `src/app/components/image-processing-types.ts` for worker request/layer payload contracts.

### Changed
- `flattenLayers(...)` in `canvas-utils.tsx` now uses worker + OffscreenCanvas by default for export/AI paths, with automatic main-thread fallback.
- `extractLayerImage(...)` now attempts worker processing first, then falls back.
- `InfiniteCanvas` high-frequency calls now use `preferMainThread` to avoid tool latency.

### Validation
- `cmd /c pnpm build` passed.
- Worker chunk emitted: `image-processing.worker` (`10.74 kB`).

---

## 2026-03-14 - Phase 5 complete: render performance hardening

### Added
- `docs/PROFILING_NOTES.md` with profiling summary and manual verification checklist.
- Lazy loading for heavy non-critical UI modules:
  - Right-side tabs in `App.tsx` (`Layers`, `Adjust`, `AI Studio`, `History`).
  - ComfyUI optional modals in `ai-comfyui-tab.tsx` (`workflow modal`, `model manager`, `batch processor`, `SAM`).
  - Toolbar text panel (`text-tool-panel`).

### Changed
- Selector migration remains complete across app code (`useEditorSelector` everywhere, no full-store component subscriptions).
- Updated optimization and project-state docs to mark Phase 5 complete.

### Validation
- `cmd /c pnpm build` passed.
- Entry JS chunk reduced from `444.72 kB` (`121.76 kB` gzip) to `264.61 kB` (`79.86 kB` gzip).

---

## 2026-03-14 - Phase 5 (priority): Selector-based render performance

### Added
- `docs/PERFORMANCE_BASELINE.md` with build metrics and selector migration coverage.

### Changed
- Migrated all former `useEditor()` full-store consumers to selector subscriptions (`useEditorSelector` + `useShallow` where needed).
- Kept backward compatibility by exporting `useEditor` as a direct alias of Zustand store hook (`useEditorStore`) so static calls like `useEditor.getState()` still work.

### Validation
- `cmd /c pnpm build` passed.

---

## 2026-03-14 - Phase 4: Image Data Architecture (base64 -> reference cache)

### Added
- `src/app/components/image-cache.ts` global cache singleton.
- `generateImageRef()` helper and layer resolver helpers in `editor-store.tsx`.
- Store actions `updateLayerImage` and `updateLayerMask`.

### Changed
- Layer model now supports `imageRef` and `maskRef` with legacy fallback fields retained.
- Canvas rendering and project I/O now resolve image data via cache refs.
- History/cache GC routines added to prevent orphaned image cache growth.

---

## 2026-03-14 - Phase 3: AI Panel Decomposition

### Changed
- Split `ai-panel.tsx` into focused modules:
  - `ai-panel.tsx` (shell)
  - `ai-comfyui-tab.tsx`
  - `ai-gemini-tab.tsx`

---

## 2026-03-14 - Phase 2: Canvas Renderer Extraction

### Changed
- Extracted rendering pipeline from `infinite-canvas.tsx` into `canvas-renderer.ts` pure functions.

---

## 2026-03-14 - Phase 1: State Management Migration (Context -> Zustand)

### Changed
- Replaced React Context editor state with Zustand store.
- Removed provider requirement from `App.tsx`.

---

## 2026-03-14 - Phase 0: Dependency Audit and Cleanup

### Removed
- Unused npm dependencies and unused shadcn/ui primitives.
- Legacy `src/app/components/figma/ImageWithFallback.tsx`.

### Added
- `docs/OPTIMIZATION_PLAN.md` optimization roadmap.

---

## 2026-03-14 - Initial project memory and build workflow

### Added
- `start_launch_app.bat`.
- Help menu `Debug Window` action (`Ctrl+Shift+I`).
- `build_portable.bat` with process-lock mitigation and versioned release folders.
- Project memory docs (`AGENTS.md`, status/docs/ADR files).

### Removed
- Legacy setup/instruction files that were no longer relevant.
