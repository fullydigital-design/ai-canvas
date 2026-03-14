# AI Canvas Project Agent Guide

This file is the operational entry point for any coding agent working in this repository.

## Startup Routine
At the beginning of every session, read these files in order:
1. `project-state.yaml`
2. `docs/PROJECT_STATUS.md`
3. `docs/KNOWN_ISSUES.md`
4. `docs/ARCHITECTURE.md`
5. `docs/TESTING_CHECKLIST.md`

## Source Of Truth
- Current project health and priorities: `docs/PROJECT_STATUS.md`
- Open bugs and regressions: `docs/KNOWN_ISSUES.md`
- System design and key file map: `docs/ARCHITECTURE.md`
- Change log for all meaningful edits: `docs/CHANGELOG.md`
- Build artifact history: `docs/RELEASE_HISTORY.md`
- Machine-readable state snapshot: `project-state.yaml`

## Working Rules
- Keep edits minimal and targeted.
- Preserve app behavior unless the task explicitly requests behavioral change.
- For any non-trivial change, update:
  - `docs/CHANGELOG.md`
  - `docs/PROJECT_STATUS.md` (if status/risks/priorities changed)
  - `docs/KNOWN_ISSUES.md` (if bug state changed)
  - `project-state.yaml` (if snapshot fields changed)
- Use absolute dates in documentation entries (`YYYY-MM-DD`).

## Build And Run Commands
- Dev app launcher (Windows): `start_launch_app.bat`
- Portable build (Windows): `build_portable.bat`
- NPM scripts:
  - `pnpm dev`
  - `pnpm build`
  - `pnpm electron:dev`

## Release Policy
- Versioned release folders are created under `release/` as:
  - `release-<major>.<minor2>.<sequence2>`
  - Example: `release-1.00.02`
- Each release folder should contain only:
  - Portable executable (`*Portable*.exe`)
  - `build-info.txt`

## Notes
- `ATTRIBUTIONS.md` is retained for licensing attribution.
- Legacy setup docs were removed and replaced by the docs in `docs/`.
