# CLAUDE.md

## Project
AI Canvas Editor — Windows-first Electron desktop app. Layered 2D canvas editing
with GPU-accelerated processing, ComfyUI and Gemini AI workflow integration, and
an optional Blender 3D bridge (feature-flagged).

## Stack
| Layer | Technology |
|-------|-----------|
| UI | React 18 + TypeScript 5.5 + Vite 6 |
| Styling | Tailwind CSS 4 + Radix UI |
| State | Zustand 5 (`editor-store.tsx`) |
| Desktop | Electron 40 (`electron/main.cjs` + `electron/preload.cjs`) |
| Build | Electron Builder → portable Windows x64 `.exe` |
| Processing | Web Workers + WebGL (GPU) / Canvas2D (CPU fallback) |
| AI | ComfyUI (HTTP), Gemini (API), SAM, Blender bridge (HTTP :8765) |

## Entry Points
| File | Role |
|------|------|
| `src/main.tsx` | React bootstrap |
| `src/app/App.tsx` | Root layout |
| `electron/main.cjs` | Main process, native menus, IPC |
| `electron/preload.cjs` | Context bridge |
| `src/app/components/editor-store.tsx` | Zustand state tree |
| `src/app/components/infinite-canvas.tsx` | Canvas engine |
| `src/app/components/canvas-renderer.ts` | WebGL + CPU renderer |
| `src/app/components/image-processing.worker.ts` | Worker thread |

## Current Phase
Phase 9 complete (9a–9i). Production-ready pending full manual QA.
**No automated test suite** — manual validation is the release gate.

## Path Alias
`@/*` → `./src/*`

## Feature Flags
- `VITE_ENABLE_3D_TAB=true` — enables the Blender 3D tab (off by default)

## Dev Commands
```bash
pnpm electron:dev        # Electron + Vite hot-reload (main dev flow)
pnpm dev                 # Vite only (renderer, no shell)
pnpm build               # Vite production build
./build_portable.bat     # Full portable .exe build → release/
pnpm tsc --noEmit        # Type-check (currently fails in 4 files — see Known Issues)
```

## Session Start (non-trivial tasks)
Read in order before touching code:
1. `project-state.yaml`
2. `docs/PROJECT_STATUS.md`
3. `docs/KNOWN_ISSUES.md`
4. `docs/ARCHITECTURE.md`

## After Every Non-Trivial Change
Update all that apply:
- `docs/CHANGELOG.md` — what changed and why
- `docs/PROJECT_STATUS.md` — if health/risks/priorities shifted
- `docs/KNOWN_ISSUES.md` — if bug state changed
- `project-state.yaml` — if snapshot fields changed

Always use `YYYY-MM-DD` for dates.

## Rules — Always
- Keep edits minimal and targeted.
- Preserve existing behaviour unless the task explicitly requests a change.
- After any canvas/rendering change: manually test the 2D golden path.
- `pnpm build` (Vite) and `tsc --noEmit` are independent — a Vite pass does not mean type-check passes, and vice versa.

## Rules — Never
- **Never remove the `VITE_ENABLE_3D_TAB` guard** — 3D tab must stay feature-flagged.
- **Never touch Blender bridge modules** (`electron/blender-*.cjs`) without confirming Windows-only scope is preserved.
- **Never commit `dist/` or `release/`** — build artifacts only.
- **Never add automated test scaffolding** unless explicitly requested.
- **Never add error handling or fallbacks for scenarios that can't happen** — trust Zustand/Electron guarantees.
- **Never use `--no-verify`** on git hooks without explicit user instruction.

## Known Issues (summary)
| Issue | Severity | Notes |
|-------|----------|-------|
| `tsc --noEmit` fails in 4 files | medium | Vite build still passes |
| No automated regression suite | medium | Manual QA is release gate |
| Mojibake in title separator | low | Cosmetic only |
| Legacy `release/win-unpacked` lingers | low | File lock; close processes first |
| Blender embed is Windows-only | low | Acceptable for current target |

See `docs/KNOWN_ISSUES.md` for full details.
