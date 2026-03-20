# Known Issues

Last updated: 2026-03-14

## Open

### 1) Legacy `release/win-unpacked` folder may remain
- Severity: low
- Status: open
- Area: build cleanup
- Symptom: root-level `release/win-unpacked` may not be deleted due to locked `app.asar`.
- Repro:
  1. Build repeatedly with Electron-related processes recently active.
  2. Inspect `release/` after build.
- Notes: current cleanup retries removal, but Windows lock can persist.
- Workaround: close all app/electron processes and remove later, or after reboot.

### 2) Mojibake in title separator (`AI Canvas - ...`)
- Severity: low
- Status: open
- Area: UI text encoding
- Files:
  - `src/app/App.tsx`
  - `src/app/components/header-bar.tsx`
- Symptom: intended separator is not rendered correctly in window/document title.
- Impact: cosmetic only.

### 3) No automated regression test suite
- Severity: medium
- Status: open
- Area: quality pipeline
- Symptom: behavior regressions can slip in because validation is manual.
- Recommended fix: add smoke tests for launch, open/save, and export paths.

### 4) TypeScript no-emit check fails in non-Phase-8 files
- Severity: medium
- Status: open
- Area: type safety
- Files:
  - `src/app/components/adjustments-panel.tsx`
  - `src/app/components/feature-flags.ts`
  - `src/app/components/header-bar.tsx`
- Symptom: `pnpm.cmd exec tsc --noEmit` reports type mismatches and invalid object literal properties.
- Impact: strict type-check gate is currently red even though Vite production build passes.

### 5) Stale-process auto-cleanup is Windows-only
- Severity: low
- Status: open
- Area: 3D process recovery
- Symptom: startup stale-process cleanup uses Windows process metadata/termination path.
- Impact: non-Windows environments fall back to state reset without managed-process kill.
- Notes: acceptable for current Windows-targeted Electron release plan.

### 6) Manual QA remains a release gate for 3D integration
- Severity: medium
- Status: open
- Area: release process
- Symptom: 3D embed + add-on flows require operator verification on target machine.
- Impact: CI cannot yet fully validate end-to-end Blender integration.
- Reference: `docs/TESTING_CHECKLIST.md`, `docs/RELEASE_RUNBOOK.md`.

## Resolved

### A) Build failure due to locked `app.asar` in `win-unpacked`
- Severity: high
- Status: mitigated
- Fix summary: `build_portable.bat` now closes matching running processes and builds into versioned release folders with cleanup.

### B) Build failure related to `signAndEditExecutable` behavior
- Severity: high
- Status: mitigated
- Fix summary: builder command in `build_portable.bat` uses `--config.win.signAndEditExecutable=false`.
