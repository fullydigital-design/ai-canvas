# Release Runbook

Last updated: 2026-03-14

## Scope
- AI Canvas desktop portable release packaging.
- Blender bridge/add-on compatibility checks for Phase 9 workflows.

## Pre-Release Validation
1. Run `pnpm.cmd build`.
2. Run `python -m py_compile blender_addon/ai_canvas_bridge_addon.py`.
3. Execute manual checks in `docs/TESTING_CHECKLIST.md`:
   - `Phase 9h Sequence Handoff Checks`
   - `Phase 9i Hardening And Fallback Checks`

## Build Portable
1. Run `build_portable.bat` from repository root.
2. Confirm a new folder is created under `release/`:
   - format: `release-<major>.<minor2>.<sequence2>`
3. Confirm only these artifacts remain in the release folder:
   - portable `.exe`
   - `build-info.txt`

## Blender Add-on Release Notes
1. Current add-on source: `blender_addon/ai_canvas_bridge_addon.py`
2. Confirm add-on panel includes:
   - `Test Bridge`
   - `Send Viewport Snapshot`
   - `Send Final Render`
   - `Send Render + Passes`
   - `Push Camera States`
   - `Pull Camera Snapshot`
   - `Send Sequence Frames`
3. Confirm setup guide is current:
   - `docs/BLENDER_ADDON_SETUP.md`

## Post-Build Documentation
1. Update `docs/CHANGELOG.md` with release-scope changes.
2. Update `docs/RELEASE_HISTORY.md` with new release folder entry.
3. Update `docs/PROJECT_STATUS.md` and `project-state.yaml`.
4. Ensure known limitations are reflected in `docs/KNOWN_ISSUES.md`.

## Rollback
1. Keep prior `release-*` folders unchanged.
2. If validation fails, do not publish the newest release folder.
3. Fix issues on source branch and rebuild to new sequence number.
