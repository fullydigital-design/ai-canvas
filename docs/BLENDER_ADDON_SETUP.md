# Blender Add-on Setup (Phase 9e)

Last updated: 2026-03-14

## Add-on file
- `blender_addon/ai_canvas_bridge_addon.py`
- Current add-on version: `0.4.0` (includes camera + sequence handoff ops)

## Install in Blender
1. Open Blender.
2. Go to `Edit > Preferences > Add-ons`.
3. Click `Install...`.
4. Select `ai_canvas_bridge_addon.py`.
5. Enable `AI Canvas Bridge`.

## Panel location
- `3D Viewport > Sidebar (N) > AI Canvas` tab.

## Bridge URL
- Default: `http://127.0.0.1:8765`
- Update in add-on panel if needed.

## Buttons
- `Test Bridge`:
  - Calls `GET /health`
  - Confirms AI Canvas bridge is reachable.
- `Send Viewport Snapshot`:
  - Captures current viewport as PNG.
  - Sends `POST /v1/render/import`.
- `Send Final Render`:
  - Uses current render result (or renders if missing).
  - Sends `POST /v1/render/import`.
- `Send Render + Passes`:
  - Sends beauty from current render result.
  - Sends optional pass files if configured:
    - depth
    - normal
    - albedo
    - object ID
    - material ID
  - Sends `POST /v1/render/import-pass-set`.
- `Push Camera States`:
  - Sends named camera states from current Blender scene to AI Canvas.
  - Sends `POST /v1/camera/states/import`.
- `Pull Camera Snapshot`:
  - Reads pending camera snapshot queued in AI Canvas 3D panel.
  - Calls `GET /v1/camera/pending?consume=1` and applies camera settings in Blender.
- `Send Sequence Frames`:
  - Reads image files from configured sequence directory + pattern.
  - Sends timeline metadata (`fps`, `start frame`) and ordered frame list.
  - Sends `POST /v1/sequence/import`.

## Optional pass files
- In the add-on panel, set any pass file paths under `Optional Pass Files`.
- Any empty pass field is ignored.
- Any configured pass path must exist on disk, otherwise send will fail with an error message.

## Metadata sidecar fields
- Add-on always sends scene metadata:
  - scene
  - camera
  - frame
  - resolution
  - engine
  - seed (auto from Cycles when available)
- You can override seed by setting `Seed Override`.

## Camera roundtrip workflow (Phase 9g)
1. In AI Canvas 3D panel, fill camera snapshot fields and click `Send Snapshot To Blender`.
2. In Blender add-on, click `Pull Camera Snapshot` to apply the queued framing.
3. In Blender add-on, click `Push Camera States` to send scene camera presets back.
4. In AI Canvas 3D panel, load one of the imported camera states and resend as needed.

## Sequence handoff workflow (Phase 9h)
1. Render or playblast a frame sequence to disk in Blender.
2. In add-on `Sequence Handoff` box:
   - set `Sequence Directory`
   - set `File Pattern` (for example `*.png` or `shot_*.png`)
   - set `Start Frame` and `FPS`
3. Click `Send Sequence Frames`.
4. In AI Canvas 3D panel, open `Sequence Handoff (Phase 9h)` and scrub frames.
5. Use `Import Current Frame To Canvas` when a frame should enter the 2D layer stack.

## Expected AI Canvas behavior
- Incoming single render is imported as a new top image layer.
- Incoming pass set is imported as grouped pass layers (Beauty/Depth/Normal/etc).
- Active layer switches to the top imported pass layer.
- 3D panel bridge stats update (`imports count`, `last import`).
- 3D panel camera section shows pending snapshot status and imported camera presets.
- 3D panel sequence section shows imported clips, frame scrubber, and lazy per-frame preview.

## Troubleshooting
- If `Test Bridge` fails:
  - Ensure AI Canvas desktop app is running.
  - Ensure no firewall blocks loopback access.
  - Check 3D panel bridge status in AI Canvas.
- If import fails:
  - Ensure image format is supported (`png`, `jpg`, `jpeg`, `webp`, `bmp`, `gif`).
  - Check AI Canvas console for `[BlenderBridge]` logs.

## Release Packaging Reference
- Release process checklist: `docs/RELEASE_RUNBOOK.md`
- Release artifact history: `docs/RELEASE_HISTORY.md`
