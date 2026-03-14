# ADR-001: Versioned Release Folder Strategy

Date: 2026-03-14  
Status: Accepted

## Context
Portable builds were being overwritten or mixed with temporary builder output, making release history hard to manage and compare.

## Decision
Use versioned output folders under `release/`:
- `release-<major>.<minor2>.<sequence2>`
- Example: `release-1.00.02`

Build logic in `build_portable.bat`:
- Reads `package.json` version.
- Uses major + two-digit minor as prefix.
- Auto-increments two-digit sequence by scanning existing release folders.
- Stores metadata in `build-info.txt`.
- Cleans non-essential build artifacts from each release folder.

## Consequences
- Release history is ordered and easy to inspect.
- Artifact provenance is explicit (`build-info.txt`).
- Storage use is reduced by keeping only portable exe and metadata.
- Some cleanup of legacy `release/win-unpacked` can still fail temporarily due to file locks.
