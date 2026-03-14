# Project Status

Last updated: 2026-03-14

## Current Phase
Stabilization and bug-fix phase. Core app flows are working locally in Electron, and release packaging is operational.

## What Works Well
- Electron app launches via `start_launch_app.bat`.
- Native app menu actions are wired (`New`, `Open`, `Save`, `Export PNG`).
- Help menu has `Debug Window` (`Ctrl+Shift+I`) to open DevTools.
- Portable build pipeline works via `build_portable.bat`.
- Release history folders are auto-versioned under `release/release-<major>.<minor2>.<seq2>`.
- Build cleanup keeps each release folder compact (portable exe + build info).

## Known Risks
- Legacy `release/win-unpacked` may remain if Windows file lock persists.
- No automated test suite is currently configured; verification is mostly manual.
- `pnpm electron:build` does not include the extra reliability/cleanup logic from `build_portable.bat`.

## Immediate Priorities
1. Fix known bugs listed in `docs/KNOWN_ISSUES.md` without regressing core editor flows.
2. Add at least smoke-level automated checks for build and critical UI actions.
3. Keep release metadata and changelog updated for every meaningful change.

## Definition Of Done For Changes
- Change implemented and validated locally.
- Relevant docs updated (`CHANGELOG`, `KNOWN_ISSUES`, `project-state.yaml`).
- No breakage in launch/build scripts.
