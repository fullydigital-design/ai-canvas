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

## Resolved

### A) Build failure due to locked `app.asar` in `win-unpacked`
- Severity: high
- Status: mitigated
- Fix summary: `build_portable.bat` now closes matching running processes and builds into versioned release folders with cleanup.

### B) Build failure related to `signAndEditExecutable` behavior
- Severity: high
- Status: mitigated
- Fix summary: builder command in `build_portable.bat` uses `--config.win.signAndEditExecutable=false`.
