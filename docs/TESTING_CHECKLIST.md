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

## Phase 8 Guardrail Checks (Run After Each Decomposition Slice)

### Canvas Interaction
- [ ] Mouse wheel zoom works and no passive listener warning appears in console.
- [ ] Pan with hand tool works at different zoom levels.
- [ ] Zoom focal point remains near cursor (no jumpy offset behavior).

### Crop
- [ ] Crop preview rectangle matches expected output area.
- [ ] `Apply` actually crops canvas/layers as expected.
- [ ] Undo after crop restores pre-crop state.

### Selection
- [ ] Rectangle selection creates correct bounds.
- [ ] Lasso selection closes and applies correct selection.
- [ ] Magic wand selection still works with tolerance/contiguous settings.

### Save / Load / Export
- [ ] Save project (`.aicproj`) after edits works.
- [ ] Load previously saved project restores layers/images/masks correctly.
- [ ] Export PNG output matches visible canvas.

### ComfyUI Flow
- [ ] Connect/disconnect works with expected status updates.
- [ ] Run/generate path completes without new console errors.
- [ ] Workflow import/export still works.

## Phase 9f Pass/Metadata Checks

### Blender Bridge Import
- [ ] `GET /health` returns `ok: true` from bridge endpoint.
- [ ] `Send Final Render` from Blender imports one top layer.
- [ ] `Send Render + Passes` imports a grouped pass set under Layers panel.

### Pass Group Behavior
- [ ] Group header appears once for the imported pass set.
- [ ] Pass badges show correct pass type (`Beauty`, `Depth`, `Normal`, etc.).
- [ ] Beauty pass is visible by default; non-beauty passes can be toggled manually.

### Metadata Persistence
- [ ] Layer Properties shows imported metadata fields (`scene`, `camera`, `frame`, `resolution`, `engine`, `seed` when present).
- [ ] Save project and reload; pass/group/metadata fields remain intact.

## Phase 9g Camera Roundtrip Checks

### App -> Blender Snapshot
- [ ] In AI Canvas 3D panel, set snapshot values and click `Send Snapshot To Blender`.
- [ ] In Blender add-on, click `Pull Camera Snapshot` and confirm camera transform/frame/lens update.

### Blender -> App Camera States
- [ ] In Blender add-on, click `Push Camera States`.
- [ ] AI Canvas 3D panel receives and lists camera states.
- [ ] Click `Load` on a received camera state and confirm form values update.

### Repeatable Framing
- [ ] Re-send loaded camera snapshot back to Blender and confirm framing repeats reliably.

## Phase 9h Sequence Handoff Checks

### Blender -> App Sequence Import
- [ ] In Blender add-on, set sequence directory/pattern/FPS/start frame.
- [ ] Click `Send Sequence Frames`; verify success report includes frame count.
- [ ] In AI Canvas 3D panel, imported sequence appears in `Sequence Handoff`.

### Frame-By-Frame Preview
- [ ] Scrub timeline slider and verify frames update correctly.
- [ ] `Prev` and `Next` buttons move one frame at a time.
- [ ] UI remains responsive while loading frames (no hard freeze).

### 2D Handoff
- [ ] Click `Import Current Frame To Canvas` and verify a new image layer is created.
- [ ] Imported layer is centered/scaled correctly to canvas bounds.
- [ ] Imported layer keeps source metadata (`sequenceId`, `frame`, `fps`).

## Phase 9i Hardening And Fallback Checks

### 3D Tab End-To-End Smoke
- [ ] Enable 3D tab feature flag and restart app.
- [ ] Open `3D` tab and verify process controls render.
- [ ] Validate Blender path and start Blender.
- [ ] Attach embed, resize app window, and verify embedded bounds follow host.
- [ ] Detach embed and verify Blender remains alive in detached mode.
- [ ] Stop Blender and verify process state resets to `ready`.

### Bridge + Add-on Integration
- [ ] In Blender add-on, `Test Bridge` returns success.
- [ ] `Send Viewport Snapshot` imports new top layer in AI Canvas.
- [ ] `Send Render + Passes` imports grouped pass layers with metadata.
- [ ] `Push Camera States` updates camera list in 3D panel.
- [ ] `Pull Camera Snapshot` applies queued camera state from AI Canvas.
- [ ] `Send Sequence Frames` imports sequence and enables frame scrubbing in 3D panel.

### Fallback Mode (3D Disabled)
- [ ] Disable 3D tab feature flag (`aiCanvas.flags.blender3dTab=false`) and restart app.
- [ ] Confirm no `3D` tab is visible.
- [ ] Confirm 2D workflows still pass: import, paint, crop, save, load, export.
- [ ] Confirm no new console errors tied to Blender APIs when 3D tab is hidden.

### Crash Recovery + Stale Process Cleanup
- [ ] Start Blender from AI Canvas and force-close AI Canvas process.
- [ ] Relaunch AI Canvas.
- [ ] Verify stale managed Blender process is auto-cleaned or explicitly reported in 3D status note.
- [ ] Verify subsequent `Start Blender` launches cleanly and state updates correctly.

### Release Gate
- [ ] `pnpm.cmd build` passes.
- [ ] `python -m py_compile blender_addon/ai_canvas_bridge_addon.py` passes.
- [ ] `build_portable.bat` generates new `release-*` folder with only portable `.exe` + `build-info.txt`.
- [ ] Blender add-on setup instructions verified against current UI labels.

## Before Marking A Bug Fixed
- [ ] Reproduce bug first.
- [ ] Apply fix.
- [ ] Re-run relevant smoke checks.
- [ ] Update `docs/KNOWN_ISSUES.md`.
- [ ] Update `docs/CHANGELOG.md`.
