# Phase 9 Plan: Blender Bridge and 3D Hub

Created: 2026-03-14
Last updated: 2026-03-14

## Goal
Turn AI Canvas into a production hub where Blender is controlled from a dedicated 3D tab, and renders/snapshots are sent directly into the 2D canvas for AI refinement workflows.

## Scope (v1)
- Windows-first implementation.
- Blender process start/stop from AI Canvas.
- Embedded Blender viewport window in a 3D tab (native child window attach).
- Blender add-on with "Send to AI Canvas" action.
- Import rendered image into active project as a new layer.

## Out of Scope (v1)
- Full Blender feature parity inside custom web UI.
- Rebuilding Blender tools in React.
- Cross-platform embedding parity (macOS/Linux) in first release.
- Real-time video streaming pipeline.

## Architecture Direction
- Host Blender as a native external process.
- Attach Blender native window as child of a host surface in Electron (Windows API path).
- Use a local bridge endpoint for Blender add-on to push render output and metadata.
- Keep hard fallback: if embedding fails, launch Blender externally and keep send-to-canvas bridge working.

## Phase 9a: Requirements and Technical Spike
Status: Complete (2026-03-14)

Deliverables:
- Confirm stable Windows embedding strategy and selected library/tooling.
- Define minimal IPC contract between app and bridge/add-on.
- Create risk log and fallback behavior list.

Exit criteria:
- Written decision record for embedding approach.
- Spike prototype proves attach/detach without app crash.

Completed:
- Added decision record: `docs/BLENDER_EMBEDDING_DECISION.md`.
- Added IPC draft spec: `docs/BLENDER_BRIDGE_IPC.md`.
- Added risk log + fallback list: `docs/BLENDER_BRIDGE_RISK_LOG.md`.
- Implemented Windows attach/detach spike harness:
  - `scripts/win-window-parent.ps1`
  - `electron/blender-embed-spike.cjs`
  - Help menu action `Run Blender Embed Spike (Notepad)`
  - IPC channel `run-blender-embed-spike`
- Added preload bridge method `electronAPI.runBlenderEmbedSpike()`.

## Phase 9b: 3D Tab Shell and Feature Flag
Status: Complete (2026-03-14)

Deliverables:
- Add new `3D` tab in AI Canvas UI.
- Add Blender state UI (`Not installed`, `Ready`, `Launching`, `Embedded`, `Detached`, `Error`).
- Add feature flag to disable 3D integration safely.

Exit criteria:
- App runs with 3D tab enabled/disabled.
- No regression in existing 2D editor workflows.

Completed:
- Added feature flag module: `src/app/components/feature-flags.ts`.
  - `VITE_ENABLE_3D_TAB` environment flag support.
  - Local override support via `localStorage` (`aiCanvas.flags.blender3dTab`).
  - Default remains disabled for safe rollout.
- Added 3D tab shell in right-side panel tabs (`App.tsx`) behind feature flag.
- Added lazy-loaded 3D panel: `src/app/components/blender-3d-panel.tsx`.
- Added Blender state UI with required statuses:
  - `Not installed`
  - `Ready`
  - `Launching`
  - `Embedded`
  - `Detached`
  - `Error`
- Added in-panel spike trigger using `electronAPI.runBlenderEmbedSpike()` for quick attach/detach checks.
- Added safe fallback behavior:
  - If feature flag is disabled while active tab is `3D`, app auto-falls back to `Adjust`.

## Phase 9c: Blender Process Manager
Status: Complete (2026-03-14)

Deliverables:
- Configurable Blender executable path and validation.
- Start/stop/restart actions from app.
- Process watchdog and graceful cleanup on app close.

Exit criteria:
- Blender can be launched and terminated reliably from app.
- Clear user-facing errors for invalid path/version/startup failures.

Completed:
- Added Electron process manager module: `electron/blender-process-manager.cjs`.
  - persistent Blender path config in Electron userData (`blender-config.json`)
  - executable validation (`exists` + spawn `--version` check with timeout)
  - process lifecycle actions: start / stop / restart
  - watchdog for orphaned process-state recovery
  - state snapshot model for renderer UI
- Added graceful shutdown cleanup in `electron/main.cjs`:
  - `before-quit` hook waits for Blender stop when app owns running process.
- Added IPC surface in `electron/main.cjs`:
  - `blender-process-get-state`
  - `blender-process-set-path`
  - `blender-process-validate-path`
  - `blender-process-start`
  - `blender-process-stop`
  - `blender-process-restart`
- Added preload bridge APIs in `electron/preload.cjs` for all process manager actions.
- Updated TypeScript Electron bridge types in `src/electron.d.ts`.
- Upgraded 3D panel (`src/app/components/blender-3d-panel.tsx`) to real process control UI:
  - save/clear/validate path
  - start/stop/restart buttons
  - live state polling + PID/version/status diagnostics

## Phase 9d: Native Window Embedding (Windows)
Status: Complete (2026-03-14)

Deliverables:
- Host container in 3D tab receives Blender window handle.
- Attach, resize-sync, focus-sync, and detach flows.
- Recovery logic for window loss/crash.

Exit criteria:
- Blender viewport is visible and interactive inside app window.
- Resize and focus behavior is stable for normal use sessions.

Completed:
- Extended Win32 helper `scripts/win-window-parent.ps1`:
  - added modes: `position`, `focus`
  - retained `attach`, `detach`
- Added embedding runtime manager: `electron/blender-embed-manager.cjs`.
  - attach Blender window to main app native window
  - sync embedded bounds from renderer host rectangle
  - focus forwarding to embedded window
  - detach flow and embed state snapshot
  - process-exit recovery hook support
- Integrated embed manager with process lifecycle in `electron/main.cjs`.
  - IPC channels added:
    - `blender-embed-get-state`
    - `blender-embed-attach`
    - `blender-embed-sync-bounds`
    - `blender-embed-focus`
    - `blender-embed-detach`
  - stop/restart now detach before process transition
  - embed state resets when Blender process exits
- Added preload bridge APIs for embed controls in `electron/preload.cjs`.
- Updated renderer bridge typings in `src/electron.d.ts`.
- Upgraded `src/app/components/blender-3d-panel.tsx`:
  - embedded host area in 3D tab
  - attach/detach controls
  - automatic bounds sync on resize/layout changes
  - click-to-focus behavior for embedded Blender
  - recovery handling when embed sync fails or process exits

## Phase 9e: Blender Add-on MVP (Send Render to AI Canvas)
Status: Complete (2026-03-14)

Deliverables:
- Blender add-on panel with:
  - `Send Viewport Snapshot`
  - `Send Final Render`
- Local bridge payload with image path/data + metadata.
- AI Canvas import handler creates new top layer and selects it.

Exit criteria:
- One-click send from Blender appears in AI Canvas in under 2 seconds (local machine target).
- Import path handles name collisions and large image files safely.

Completed:
- Added local bridge server module: `electron/blender-bridge-server.cjs`.
  - loopback-only binding (`127.0.0.1:8765`)
  - `GET /health`
  - `POST /v1/render/import`
  - payload validation + supported format checks
  - image path → data URL materialization for renderer import
  - import metrics in bridge state (`importsCount`, `lastImportId`, `lastImportAt`)
- Integrated bridge server lifecycle in `electron/main.cjs`.
  - starts on app ready
  - stops during app quit cleanup
  - import events dispatched to renderer via `blender-bridge-import`
- Added preload APIs:
  - `blenderBridgeGetState`
  - `onBlenderBridgeImport`
- Extended TypeScript bridge typings in `src/electron.d.ts` for bridge state/import event payload.
- Added renderer import handler in `src/app/App.tsx`:
  - listens for bridge import events
  - creates new top image layer from incoming render
  - activates imported layer and switches right tab to `Layers`
- Added Blender add-on MVP:
  - `blender_addon/ai_canvas_bridge_addon.py`
  - panel in `View3D > Sidebar > AI Canvas`
  - actions:
    - `Test Bridge`
    - `Send Viewport Snapshot`
    - `Send Final Render`
- Added setup guide:
  - `docs/BLENDER_ADDON_SETUP.md`

## Phase 9f: Passes and Metadata Pipeline
Status: Complete (2026-03-14)

Deliverables:
- Optional pass export/import support:
  - beauty
  - depth
  - normal
  - albedo
  - object/material ID (if available)
- Metadata sidecar (`camera`, `frame`, `resolution`, `engine`, `seed` when available).

Exit criteria:
- Pass set imports as organized layers/groups in AI Canvas.
- Metadata is visible in layer/project info panel.

Completed:
- Extended bridge server contract in `electron/blender-bridge-server.cjs`:
  - accepts pass sets through:
    - `POST /v1/render/import` (single or multi-pass)
    - `POST /v1/render/import-pass-set` (alias route)
  - supports pass payload styles:
    - `passes: []`
    - `passFiles: { beauty, depth, normal, albedo, object_id, material_id }`
  - supports metadata sidecar merge through `metadataPath` + inline `metadata`
  - tracks last pass import summary (`lastPassCount`, `lastPassTypes`)
- Extended renderer import pipeline in `src/app/App.tsx`:
  - imports pass sets in one history step
  - creates grouped layers (`blenderGroupId`, `blenderGroupName`, `blenderPassType`)
  - persists per-layer source metadata (`scene`, `camera`, `frame`, `resolution`, `engine`, `seed`, extras)
- Extended layer model + project I/O:
  - `src/app/components/editor-store.tsx` (new Blender pass/group/metadata fields)
  - `src/app/components/project-io.tsx` (load/save compatibility for new fields)
- Extended layers UI in `src/app/components/layers-panel.tsx`:
  - shows pass-group headers in the layer list
  - pass badges per layer
  - source metadata block in Layer Properties panel
- Extended 3D panel bridge diagnostics in `src/app/components/blender-3d-panel.tsx`:
  - displays last imported pass count/types
- Upgraded Blender add-on `blender_addon/ai_canvas_bridge_addon.py`:
  - added `Send Render + Passes`
  - optional pass file pickers (depth/normal/albedo/object ID/material ID)
  - metadata improvements (`resolution`, `seed override/auto seed`)

## Phase 9g: Camera and Scene Roundtrip (MVP)
Status: Complete (2026-03-14)

Deliverables:
- Send camera snapshot settings from AI Canvas to Blender add-on.
- Recall named camera states from Blender into app.

Exit criteria:
- Camera preset roundtrip works for at least one scene with repeatable framing.

Completed:
- Extended bridge camera contract in `electron/blender-bridge-server.cjs`:
  - `POST /v1/camera/snapshot` (queue app-authored camera snapshot)
  - `GET /v1/camera/pending` (read pending snapshot, optional consume)
  - `POST /v1/camera/states/import` (send named Blender camera states into app)
  - camera diagnostics added to bridge state (`pendingUpdatedAt`, `lastCameraStatesCount`, `lastCameraScene`)
- Extended Electron main/preload bridge:
  - `electron/main.cjs`:
    - forwards `blender-bridge-camera-states` renderer event
    - adds IPC handlers:
      - `blender-bridge-set-camera-snapshot`
      - `blender-bridge-get-camera-state`
  - `electron/preload.cjs`:
    - adds `blenderBridgeSetCameraSnapshot(...)`
    - adds `blenderBridgeGetCameraState()`
    - adds `onBlenderBridgeCameraStates(...)`
  - `src/electron.d.ts` updated with camera snapshot/state message typings.
- Added camera roundtrip UI in `src/app/components/blender-3d-panel.tsx`:
  - editable camera snapshot form (name, camera, frame, lens, location, rotation, resolution)
  - `Send Snapshot To Blender` action
  - bridge camera state diagnostics
  - imported camera states list + `Load` action
- Upgraded Blender add-on `blender_addon/ai_canvas_bridge_addon.py`:
  - `Push Camera States` (Blender -> AI Canvas)
  - `Pull Camera Snapshot` (AI Canvas -> Blender, applies transform/frame/lens/resolution)
  - camera roundtrip panel section in add-on UI

## Phase 9h: Sequence/Video Handoff (Foundation)
Status: Complete (2026-03-14)

Deliverables:
- Add frame-sequence import path from Blender playblast/render output.
- Create timeline-ready data model (non-destructive, frame-aware).

Exit criteria:
- Sequence imports without blocking UI and can be previewed frame-by-frame.

Completed implementation:
- Extended bridge server (`electron/blender-bridge-server.cjs`) with sequence foundation:
  - `POST /v1/sequence/import`
  - `GET /v1/sequence/list`
  - lazy frame resolver via bridge API (`getSequenceFrameData`) to avoid eager full decode on import.
- Extended Electron bridge wiring:
  - main event push: `blender-bridge-sequence`
  - IPC channels: `blender-bridge-get-sequences`, `blender-bridge-get-sequence-frame`
  - preload API mirror for the same calls/events.
- Added timeline-ready renderer model in `src/app/components/blender-sequence-store.ts`:
  - clip/frame metadata model
  - active sequence + active frame index
  - per-frame preview state (`idle/loading/ready/error`) for non-blocking lazy preview.
- Updated `src/app/components/blender-3d-panel.tsx`:
  - Sequence Handoff panel
  - clip selector + frame scrubber + prev/next controls
  - lazy frame preview fetch per active frame
  - import current frame to 2D canvas as a normal image layer (non-destructive source).
- Updated Blender add-on (`blender_addon/ai_canvas_bridge_addon.py`, v0.4.0):
  - sequence directory/pattern/FPS/start-frame settings
  - `Send Sequence Frames` operator posting to `/v1/sequence/import`.

Validation:
- `pnpm.cmd build` passes.
- `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passes.

## Phase 9i: Hardening, QA, Packaging
Status: Complete (2026-03-14)

Deliverables:
- Full smoke checklist for 3D tab + fallback mode.
- Crash recovery and stale-process cleanup verification.
- Build/release documentation updates (including setup guide for Blender add-on).

Exit criteria:
- `pnpm.cmd build` green.
- Manual QA pass complete on target Windows machine.
- Release notes and known limitations documented.

Completed implementation:
- Hardened Blender process lifecycle in `electron/blender-process-manager.cjs`:
  - persisted last managed process record (`pid`, `executablePath`, `startedAt`)
  - startup stale-process recovery path with safe matching checks (name/path/start-time)
  - automatic cleanup attempt for stale managed Blender process on Windows
  - recovery note surfaced in process state for operator visibility.
- Updated 3D panel (`src/app/components/blender-3d-panel.tsx`) to display recovery note from process state.
- Extended 3D/fallback QA coverage in `docs/TESTING_CHECKLIST.md`:
  - end-to-end 3D smoke
  - fallback mode checks with 3D disabled
  - crash recovery verification path
  - release gate checklist.
- Added release runbook `docs/RELEASE_RUNBOOK.md` for packaging + validation flow.
- Updated documentation set (`PROJECT_STATUS`, `ARCHITECTURE`, `BLENDER_ADDON_SETUP`, `KNOWN_ISSUES`, `CHANGELOG`, `project-state.yaml`, `OPTIMIZATION_PLAN`) for Phase 9 completion tracking.

Validation:
- `pnpm.cmd build` passes.
- `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passes.
- `node -e "require('./electron/blender-process-manager.cjs')"` module sanity check passes.
- stale-recovery dry-run check passes (mismatch-name path safely skipped, no false process kill).

## Phase 9 Execution Order
1. 9a
2. 9b
3. 9c
4. 9d
5. 9e
6. 9f
7. 9g
8. 9h
9. 9i

## Rollout Strategy
- Start behind feature flag.
- Ship internal preview after 9e.
- Expand to advanced passes/workflows after 9f and 9g.

## Status Table

| Subphase | Status | Started | Completed |
| --- | --- | --- | --- |
| 9a | Complete | 2026-03-14 | 2026-03-14 |
| 9b | Complete | 2026-03-14 | 2026-03-14 |
| 9c | Complete | 2026-03-14 | 2026-03-14 |
| 9d | Complete | 2026-03-14 | 2026-03-14 |
| 9e | Complete | 2026-03-14 | 2026-03-14 |
| 9f | Complete | 2026-03-14 | 2026-03-14 |
| 9g | Complete | 2026-03-14 | 2026-03-14 |
| 9h | Complete | 2026-03-14 | 2026-03-14 |
| 9i | Complete | 2026-03-14 | 2026-03-14 |
