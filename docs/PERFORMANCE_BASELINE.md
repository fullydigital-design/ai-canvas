# Performance Baseline

Last updated: 2026-03-14

## Build Metrics (production)
Command:
- `cmd /c pnpm build`

### Snapshot A (before lazy loading)
- JS entry bundle: `444.72 kB`
- JS entry gzip: `121.76 kB`
- CSS bundle: `68.45 kB`
- CSS gzip: `11.62 kB`
- Build time: `1.27s`

### Snapshot B (after Phase 5 lazy loading)
- JS entry bundle: `264.61 kB`
- JS entry gzip: `79.86 kB`
- Total emitted JS across chunks: `440.29 kB`
- CSS bundle: `68.45 kB`
- CSS gzip: `11.62 kB`
- Build time: `1.24s`

### Snapshot C (after Phase 6 worker offload)
- JS entry bundle: `266.74 kB`
- JS entry gzip: `80.67 kB`
- Worker chunk: `10.74 kB` (`image-processing.worker`)
- Total emitted JS across chunks: `452.86 kB`
- CSS bundle: `68.45 kB`
- CSS gzip: `11.62 kB`
- Build time: `1.29s`

### Snapshot D (after Phase 7 WebGL preview)
- JS entry bundle: `277.35 kB`
- JS entry gzip: `84.42 kB`
- Worker chunk: `10.74 kB` (`image-processing.worker`)
- Total emitted JS across chunks: `463.22 kB`
- CSS bundle: `68.45 kB`
- CSS gzip: `11.62 kB`
- Build time: `1.30s`

## Store Subscription Metrics
- Full-store `useEditor()` consumers in app code: `0` (excluding comment text in `editor-store.tsx`)
- `useEditorSelector(...)` call sites: `24`

## Notes
- Phase 7 intentionally increases JS footprint slightly to add GPU preview capabilities.
- CPU fallback remains active for unsupported adjustments and non-WebGL environments.
