# Architecture

## Runtime Overview

- **UI:** React 18 + TypeScript + Vite
- **Desktop shell:** Electron (`electron/main.cjs`, `electron/preload.cjs`)
- **Styling:** Tailwind CSS + Radix UI primitives (`src/app/components/ui/`)
- **State:** Zustand store (`src/app/components/editor-store.tsx`)

## Entry Points

| File | Role |
|------|------|
| `src/main.tsx` | React bootstrap |
| `src/app/App.tsx` | Main app layout |
| `electron/main.cjs` | Electron main process |
| `electron/preload.cjs` | IPC bridge to renderer |

## Blender Bridge

Four Electron-side modules handle the full Blender lifecycle:

| Module | Responsibility |
|--------|---------------|
| `electron/blender-process-manager.cjs` | Process start/stop/restart, stale-process recovery |
| `electron/blender-embed-manager.cjs` | Embedded/detached window management, bounds sync |
| `electron/blender-bridge-server.cjs` | HTTP bridge on `127.0.0.1:8765` |
| `electron/blender-embed-spike.cjs` | Embed test runner |

Bridge server routes:
- `/v1/render/import`, `/v1/render/import-pass-set` — render and pass-set import
- `/v1/camera/snapshot`, `/v1/camera/pending`, `/v1/camera/states/import` — camera roundtrip
- `/v1/sequence/import`, `/v1/sequence/list` — sequence handoff with lazy frame fetch

Blender add-on: `blender_addon/ai_canvas_bridge_addon.py`
- Viewport and final render send with optional pass-set handoff
- Camera push/pull roundtrip
- Sequence frame batch send

## Canvas & Processing

- **Canvas engine:** `src/app/components/infinite-canvas.tsx`
- **Render backend:** `src/app/components/canvas-renderer.ts` — Canvas2D loop, WebGL preview path, CPU fallback
- **Worker processing:** `src/app/components/image-processing.worker.ts` + `image-worker/` modules (flatten, adjustments, filters)
- **Export:** `flattenLayers()` in `canvas-utils.tsx` — OffscreenCanvas offload with main-thread fallback

## AI Integration

- **AI panel:** `src/app/components/ai-panel.tsx`
- **ComfyUI:** `comfyui-client.tsx`, `comfyui-connect-panel.tsx`, `workflow-presets.ts`
- **Gemini:** `ai-gemini-tab.tsx`, `gemini-model-manager.tsx`
- **3D tab (feature flag):** `blender-3d-panel.tsx` — disabled by default

## Project Format

- File extension: `.aicproj` (JSON)
- Layers carry Blender pass metadata: `blenderGroupId`, `blenderPassType`, `sourceMetadata`
- Auto-save: `src/app/components/auto-save.ts`
- Native open/save dialogs via Electron IPC in `electron/main.cjs`
