# Architecture

Last updated: 2026-03-14

## Runtime Overview
- UI stack: React 18 + TypeScript + Vite.
- Desktop shell: Electron (`electron/main.cjs`, `electron/preload.cjs`).
- Styling: Tailwind + componentized UI primitives under `src/app/components/ui`.
- Editor state: centralized in `src/app/components/editor-store.tsx`.

## Key App Entry Points
- React bootstrap: `src/main.tsx`
- Main app layout: `src/app/App.tsx`
- Electron main process: `electron/main.cjs`
- Electron preload bridge: `electron/preload.cjs`
- Blender embed spike runner: `electron/blender-embed-spike.cjs`
- Blender process manager: `electron/blender-process-manager.cjs`
  - persists last managed process record to support startup stale-process recovery after abnormal exits
- Blender embed manager: `electron/blender-embed-manager.cjs`
- Blender bridge server: `electron/blender-bridge-server.cjs`
  - supports render imports and pass sets (`/v1/render/import`, `/v1/render/import-pass-set`)
  - supports camera roundtrip routes (`/v1/camera/snapshot`, `/v1/camera/pending`, `/v1/camera/states/import`)
  - supports sequence handoff (`/v1/sequence/import`, `/v1/sequence/list`) with lazy frame fetch
- Windows window-parent helper: `scripts/win-window-parent.ps1`
- Blender add-on MVP: `blender_addon/ai_canvas_bridge_addon.py`
  - supports viewport/final render send plus optional pass-set handoff
  - supports camera push/pull roundtrip actions
  - supports sequence frame batch send (directory + pattern + fps + start frame)

## Main Functional Areas
- Canvas engine: `src/app/components/infinite-canvas.tsx`
- Render backend: `src/app/components/canvas-renderer.ts`
- GPU adjustment preview: `src/app/components/webgl-adjustments.ts`
- Worker image processing: `src/app/components/image-processing.worker.ts`
  - Worker modules: `src/app/components/image-worker/*` (`protocol`, `flatten`, `extract-layer`, `adjustments`, `filters`, `shared`)
- Layer management: `src/app/components/layers-panel.tsx`
- Image adjustments: `src/app/components/adjustments-panel.tsx`, `adjustment-utils.tsx`
- AI integration:
  - `src/app/components/ai-panel.tsx`
  - `src/app/components/comfyui-client.tsx`
  - `src/app/components/comfyui-connect-panel.tsx`
  - `src/app/components/workflow-presets.ts`
    - Preset modules: `workflow-presets-data.ts`, `workflow-presets-types.ts`, `workflow-presets-schema.ts`, `workflow-presets-helpers.ts`
- Project I/O: `src/app/components/project-io.tsx`
- Keyboard shortcuts: `src/app/components/keyboard-shortcuts.tsx`
- Electron menu event hook: `src/app/components/use-electron-menu.ts`
- 3D integration shell:
  - `src/app/components/blender-3d-panel.tsx`
  - `src/app/components/blender-sequence-store.ts`
  - `src/app/components/feature-flags.ts`

## Rendering and Processing Paths
- Real-time preview path:
  - Canvas2D render loop in `canvas-renderer.ts`.
  - For supported adjustments, preview attempts WebGL shader processing.
  - Unsupported or unavailable GPU cases fall back to CPU adjustments.
- Export and AI flattening path:
  - `flattenLayers(...)` in `canvas-utils.tsx` prefers worker offload via OffscreenCanvas.
  - Automatic fallback to main-thread processing when needed.

## Build And Release
- Dev launcher: `start_launch_app.bat`
- Portable build + release foldering: `build_portable.bat`
- NPM scripts and builder config: `package.json`
- Build artifacts:
  - `dist/` for web bundle
  - `release/release-*/` for versioned portable outputs

## Data/State Notes
- Project file format: `.aicproj` JSON-based structure.
- Blender pass import metadata is persisted per layer (`blenderGroupId`, `blenderPassType`, `sourceMetadata`).
- Auto-save support exists in `src/app/components/auto-save.ts`.
- Electron IPC handles native open/save dialogs in `electron/main.cjs`.

## Operational Rule
When changing core behavior in any area above, update this file if the architecture map becomes outdated.
