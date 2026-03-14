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

## Main Functional Areas
- Canvas engine: `src/app/components/infinite-canvas.tsx`
- Layer management: `src/app/components/layers-panel.tsx`
- Image adjustments: `src/app/components/adjustments-panel.tsx`, `adjustment-utils.tsx`
- AI integration:
  - `src/app/components/ai-panel.tsx`
  - `src/app/components/comfyui-client.tsx`
  - `src/app/components/comfyui-connect-panel.tsx`
  - `src/app/components/workflow-presets.tsx`
- Project I/O: `src/app/components/project-io.tsx`
- Keyboard shortcuts: `src/app/components/keyboard-shortcuts.tsx`
- Electron menu event hook: `src/app/components/use-electron-menu.ts`

## Build And Release
- Dev launcher: `start_launch_app.bat`
- Portable build + release foldering: `build_portable.bat`
- NPM scripts and builder config: `package.json`
- Build artifacts:
  - `dist/` for web bundle
  - `release/release-*/` for versioned portable outputs

## Data/State Notes
- Project file format: `.aicproj` JSON-based structure.
- Auto-save support exists in `src/app/components/auto-save.ts`.
- Electron IPC handles native open/save dialogs in `electron/main.cjs`.

## Operational Rule
When changing core behavior in any area above, update this file if the architecture map becomes outdated.
