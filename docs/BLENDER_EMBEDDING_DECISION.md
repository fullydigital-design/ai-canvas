# Blender Embedding Decision (Phase 9a)

Date: 2026-03-14  
Status: Accepted (for Phase 9 MVP)

## Decision
Use a Windows-native child window attach strategy for Blender integration:

1. Launch Blender as an external process from Electron main process.
2. Retrieve Blender top-level window handle (HWND).
3. Reparent Blender window into an app-owned host window using Win32 `SetParent`.
4. Keep a hard fallback mode where Blender runs externally if attach fails.

For Phase 9a spike validation, Notepad is used as a safe proxy process to verify attach/detach lifecycle.

## Why this approach
- Lowest implementation risk for initial integration in Electron on Windows.
- Preserves full native Blender UX without rebuilding Blender UI in React.
- No video stream latency or capture overhead in v1.
- Allows gradual hardening before full 3D tab rollout.

## Alternatives considered
- Pixel/video streaming into canvas:
  - rejected for v1 due to latency, input mapping complexity, and quality tradeoffs.
- Full Blender UI recreation in web UI:
  - rejected due to extreme scope and maintenance burden.
- Keeping Blender always external:
  - acceptable fallback, but not the target integrated UX.

## Constraints
- Windows-first only for embedding layer.
- Native window attach behavior can vary by Blender version, display scaling, and GPU driver setup.
- Requires robust failover to detached mode.

## Spike implementation
- Helper script: `scripts/win-window-parent.ps1`
- Spike runner: `electron/blender-embed-spike.cjs`
- Trigger:
  - Help menu item: `Run Blender Embed Spike (Notepad)`
  - IPC handler: `run-blender-embed-spike`

## Exit criteria outcome (Phase 9a)
- Written decision record: complete.
- Attach/detach spike implementation added: complete.
- Manual run verification is now available in-app through Help menu.
