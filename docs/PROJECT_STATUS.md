# Project Status

Last updated: 2026-03-14

## Current Phase
Phase 9 complete (9a-9i). Next execution step: DONE - Fully implemented.

## What Works Well
- Electron app launches via `start_launch_app.bat`.
- Native menu actions are wired (`New`, `Open`, `Save`, `Export PNG`, `Debug Window`).
- Portable build pipeline works via `build_portable.bat` with versioned release folders.
- Image reference cache architecture is active (`imageRef`/`maskRef` + GC).
- Zustand selector migration is complete across app components.
- Lazy loading is active for heavy non-critical panels/modals.
- Pixel-heavy flatten/export operations run on worker path by default.
- GPU preview path is available for supported adjustments with CPU fallback.
- Blender embed spike is available from Help menu (`Run Blender Embed Spike (Notepad)`).
- 3D tab shell exists behind feature flag with Blender integration state panel.
- 3D panel now controls Blender process lifecycle (path validation + start/stop/restart).
- Blender window can now attach into the 3D host panel with bounds + focus sync and detach recovery.
- Blender add-on MVP can send viewport/final render directly to AI Canvas as new top layers.
- Blender pass sets now import as grouped layers with per-pass metadata visible in Layer Properties.
- Camera snapshots can now be queued from AI Canvas and pulled/applied in Blender add-on.
- Blender camera states can now be pushed back and loaded into AI Canvas camera snapshot form.
- Blender add-on can now send image sequences (dir + pattern + fps + start frame) to AI Canvas.
- 3D panel now includes sequence timeline preview with frame scrubbing and lazy frame loading.
- Current sequence frame can be imported into the 2D canvas as a standard image layer.

## Recent Validation
- `pnpm.cmd build` passed on 2026-03-14.
- `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passed on 2026-03-14.
- `node -e "require('./electron/blender-process-manager.cjs')"` passed on 2026-03-14.
- `pnpm.cmd exec tsc --noEmit` reports existing type errors outside Phase 8 scope.
- Worker and WebGL modules are included in the production bundle.

## Known Risks
- Legacy `release/win-unpacked` may remain if Windows file lock persists.
- No automated regression suite yet (manual validation still required).
- Some UI strings still contain encoding artifacts in a few files.
- TypeScript no-emit pass currently fails in a few non-Phase-8 files.
- Blender embedding is Windows-specific and depends on native window attach stability.
- 3D integration must remain feature-flagged to protect 2D production workflow stability.

## Immediate Priorities
1. Run full manual Phase 9i checklist on target Windows machine (`docs/TESTING_CHECKLIST.md`).
2. Keep current bug-fix stabilization in parallel for critical 2D workflows.
3. Package next portable release with `build_portable.bat` and document in `docs/RELEASE_HISTORY.md`.

## Definition Of Done For Changes
- Change implemented and validated locally.
- Relevant docs updated (`CHANGELOG`, `KNOWN_ISSUES`, `project-state.yaml`).
- No breakage in launch/build scripts.
