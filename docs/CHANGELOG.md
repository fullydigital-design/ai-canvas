# Changelog

## 2026-03-14

### Added
- Added `start_launch_app.bat` for local Electron launch flow.
- Added `Help -> Debug Window` menu action in Electron app menu (`Ctrl+Shift+I`).
- Added and evolved `build_portable.bat`:
  - Portable build automation
  - Process-lock mitigation
  - Versioned release output folders (`release-1.00.01`, `release-1.00.02`, ...)
  - Post-build cleanup policy for release history
  - `build-info.txt` generation per release
- Added project memory system:
  - `AGENTS.md`
  - `project-state.yaml`
  - `docs/PROJECT_STATUS.md`
  - `docs/ARCHITECTURE.md`
  - `docs/KNOWN_ISSUES.md`
  - `docs/RELEASE_HISTORY.md`
  - `docs/TESTING_CHECKLIST.md`
  - `docs/decisions/ADR-001-release-build-versioning.md`

### Changed
- Standardized release artifact management to versioned subfolders.

### Removed
- Removed legacy instructions file: `CURSOR-SETUP.md`.
- Removed placeholder guidelines file: `guidelines/Guidelines.md`.
