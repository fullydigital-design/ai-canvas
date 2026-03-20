# AI Canvas Editor

A Windows-first desktop creative editor built with Electron, React, and TypeScript.

AI Canvas combines a high-performance 2D workflow with an optional Blender bridge for 3D-assisted pipelines.

## Highlights

- Infinite canvas editing with layered workflows.
- Worker-backed image processing for heavy flatten/export operations.
- GPU preview path (WebGL) with safe CPU fallback.
- ComfyUI and Gemini-oriented AI workflow panels.
- Optional Blender bridge:
  - process control from inside the app
  - embedded/detached Blender window management
  - render/pass import with metadata
  - camera state roundtrip
  - sequence handoff and frame scrubbing

## Tech Stack

- Electron
- React 18 + TypeScript
- Vite
- Zustand
- Tailwind CSS

## Quick Start (Windows)

### 1) Install prerequisites

- Node.js 20+ recommended
- `pnpm` package manager
- Python 3.x (for Blender add-on validation tasks)

### 2) Install dependencies

```powershell
pnpm install
```

### 3) Run in development mode

```powershell
pnpm electron:dev
```

Alternative launcher:

```powershell
.\start_launch_app.bat
```

## Build

### Web build

```powershell
pnpm build
```

### Portable Windows release

```powershell
.\build_portable.bat
```

Release artifacts are created in versioned folders under `release/` using:
`release-<major>.<minor2>.<sequence2>`.

## Blender 3D Tab (Feature Flag)

The 3D tab is disabled by default.

Enable via environment variable in PowerShell:

```powershell
$env:VITE_ENABLE_3D_TAB="true"
pnpm electron:dev
```

Or via localStorage override key:

```text
aiCanvas.flags.blender3dTab=true
```

## Git Helpers Included

Root scripts for common sync tasks:

- `github_login.bat` for browser-based GitHub authentication.
- `git_upload.bat` to stage, commit, and push `main`.
- `git_download.bat` to fetch/pull latest `main`.
- `git_push.bat` and `git_pull_latest.bat` as compatibility wrappers.

## Repository Docs

Project operational and architecture docs live in `docs/`:

- `docs/PROJECT_STATUS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/ARCHITECTURE.md`
- `docs/TESTING_CHECKLIST.md`
- `docs/CHANGELOG.md`
- `docs/RELEASE_HISTORY.md`

## Status Snapshot

- Current tracked phase: Phase 9 complete (9a-9i).
- Build pipeline: active and release-foldered.
- Test strategy: manual smoke + phase checklists (automated regression suite not yet in place).

---

If you are contributing as an agent or collaborator, read `AGENTS.md` first.
