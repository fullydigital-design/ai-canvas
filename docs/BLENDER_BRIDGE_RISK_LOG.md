# Blender Bridge Risk Log (Phase 9a)

Date: 2026-03-14  
Status: Active

## Risk 1: Native window attach instability
- Severity: High
- Impact: app freeze/crash or unusable 3D tab
- Mitigation:
  - keep 3D integration behind feature flag
  - implement attach timeout and safe detach
  - fallback to external Blender mode

## Risk 2: Blender window handle detection fails
- Severity: High
- Impact: cannot embed Blender
- Mitigation:
  - retry handle lookup with bounded timeout
  - capture diagnostics
  - allow manual "Open externally" fallback

## Risk 3: DPI scaling and multi-monitor layout issues
- Severity: Medium
- Impact: wrong sizing/positioning in host area
- Mitigation:
  - sync bounds on resize/focus events
  - test on common scaling profiles (100%, 125%, 150%)
  - provide reset layout action

## Risk 4: Input focus conflicts (keyboard/mouse shortcuts)
- Severity: Medium
- Impact: inconsistent tool shortcuts or lost focus
- Mitigation:
  - explicit focus transfer controls
  - temporary shortcut suspension while 3D tab focused

## Risk 5: Bridge endpoint unavailable
- Severity: Medium
- Impact: Send to AI Canvas fails
- Mitigation:
  - health check before send
  - queue retry and clear error status in UI
  - manual file import remains available

## Risk 6: Large render import performance/memory pressure
- Severity: Medium
- Impact: UI lag or memory spikes
- Mitigation:
  - async import path
  - progressive decode/thumbnail strategy
  - enforce max file size warning threshold

## Risk 7: Version mismatch between add-on and app
- Severity: Low
- Impact: protocol errors
- Mitigation:
  - include protocol version in every payload
  - add compatibility warning and guide

## Fallback behavior list
1. If embed attach fails: keep Blender running externally and continue bridge workflow.
2. If bridge health fails: disable send buttons and show reconnect action.
3. If pass import partially fails: import successful files and report failed passes.
4. If process watchdog detects orphaned Blender PID: reset process state to default (`Ready` when path is configured).
5. On startup after abnormal exit, attempt stale managed Blender cleanup (Windows) before restoring process-ready state.
