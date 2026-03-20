# Profiling Notes

Date: 2026-03-14
Phase: 7

## Objective
Validate WebGL preview path integration while keeping behavior-safe CPU fallback.

## What was profiled
1. Production build output (`cmd /c pnpm build`).
2. Integration points in render pipeline (`canvas-renderer.ts` + `webgl-adjustments.ts`).
3. Fallback routing for unsupported adjustments.

## Findings
- Build passes with new WebGL module.
- Preview path now attempts shader-based processing for supported adjustments:
  - levels, curves, hue/saturation, blur
- Fallback conditions are active and deterministic:
  - unsupported combinations automatically use CPU `applyAllAdjustments`.
- Worker offload (Phase 6) remains active for export/AI flattening.

## Files added
- `src/app/components/webgl-adjustments.ts`

## Files updated
- `src/app/components/canvas-renderer.ts`

## Manual runtime checks recommended
1. Verify adjustment preview on an image layer for levels/curves/hue/blur.
2. Verify color balance, filters, and sharpen still render correctly (CPU fallback path).
3. Verify rendering behavior on systems where WebGL is unavailable (automatic CPU fallback).
