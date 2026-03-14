# Testing Checklist

Last updated: 2026-03-14

## Manual Smoke Checks

### Launch
- [ ] Run `start_launch_app.bat`.
- [ ] App opens without immediate crash.
- [ ] Main canvas and side panels render.

### Menu / DevTools
- [ ] `Help -> Debug Window` opens detached DevTools.
- [ ] `Ctrl+Shift+I` opens detached DevTools.

### Core File Operations
- [ ] Save project (`.aicproj`) works.
- [ ] Load project (`.aicproj`) works.
- [ ] Export PNG works.
- [ ] Drag-and-drop image import works.

### Build Pipeline
- [ ] Run `build_portable.bat`.
- [ ] New versioned folder created under `release/`.
- [ ] New folder contains only:
  - portable `.exe`
  - `build-info.txt`
- [ ] Existing versioned folders remain intact.

### Regression Focus
- [ ] Undo/redo still works on basic edits.
- [ ] Layer visibility/opacity controls still behave correctly.
- [ ] No new console errors in DevTools during basic flow.

## Before Marking A Bug Fixed
- [ ] Reproduce bug first.
- [ ] Apply fix.
- [ ] Re-run relevant smoke checks.
- [ ] Update `docs/KNOWN_ISSUES.md`.
- [ ] Update `docs/CHANGELOG.md`.
