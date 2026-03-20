# Blender Bridge IPC Contract

Date: 2026-03-14  
Status: Implemented through Phase 9i hardening (`/health`, render import routes, camera roundtrip routes, sequence handoff routes)

## Purpose
Define a minimal local contract between:
- AI Canvas desktop app (Electron + React)
- Blender add-on
- Local bridge agent

## Transport
- Local HTTP on loopback (`127.0.0.1`) for command/data handoff.
- Optional local WebSocket for progress/events (later phase).

## Local bridge defaults
- Base URL: `http://127.0.0.1:8765`
- Health endpoint: `GET /health`

### Health response (example)
```json
{
  "ok": true,
  "service": "ai-canvas-blender-bridge",
  "version": "0.1.0"
}
```

## Import render endpoint
- `POST /v1/render/import`
- Content-Type: `application/json`

### Request body (minimum: single image)
```json
{
  "source": "blender",
  "kind": "final_render",
  "imagePath": "C:\\\\renders\\\\shot_001.png",
  "projectHint": "active",
  "layerName": "Blender Render",
  "metadata": {
    "scene": "Shot_001",
    "camera": "Camera.Main",
    "frame": 101,
    "width": 1920,
    "height": 1080,
    "engine": "CYCLES"
  }
}
```

### Request body (pass set)
```json
{
  "source": "blender",
  "kind": "pass_set",
  "passSetId": "shot001_frame101",
  "groupName": "Shot 001 Pass Set",
  "passes": [
    { "passType": "beauty", "name": "Beauty", "imagePath": "C:\\\\renders\\\\beauty.png" },
    { "passType": "depth", "name": "Depth", "imagePath": "C:\\\\renders\\\\depth.png" },
    { "passType": "normal", "name": "Normal", "imagePath": "C:\\\\renders\\\\normal.png" }
  ],
  "metadataPath": "C:\\\\renders\\\\shot001.meta.json",
  "metadata": {
    "scene": "Shot_001",
    "camera": "Camera.Main",
    "frame": 101,
    "engine": "CYCLES",
    "seed": 42
  }
}
```

Supported pass types:
- `beauty`
- `depth`
- `normal`
- `albedo`
- `object_id`
- `material_id`
- `custom`

The server also accepts `passFiles` object payloads as a convenience:
```json
{
  "passFiles": {
    "beauty": "C:\\\\renders\\\\beauty.png",
    "depth": "C:\\\\renders\\\\depth.png"
  }
}
```

### Response body
```json
{
  "ok": true,
  "importId": "imp_20260314_001",
  "passCount": 3,
  "message": "Render queued for import"
}
```

## Pass-set endpoint alias
- `POST /v1/render/import-pass-set`
- Uses the same payload and response format as `/v1/render/import`.

## Camera roundtrip endpoints (Phase 9g)

### Queue app camera snapshot for Blender
- `POST /v1/camera/snapshot`

Request:
```json
{
  "name": "AI Canvas Snapshot A",
  "camera": "Camera.Main",
  "frame": 101,
  "lens": 50,
  "location": [1.2, -3.5, 2.0],
  "rotation_euler": [1.1, 0.1, 2.7],
  "resolution": { "width": 1920, "height": 1080, "percentage": 100 }
}
```

Response:
```json
{
  "ok": true,
  "message": "Camera snapshot queued for Blender add-on pull.",
  "pendingSnapshot": { "name": "AI Canvas Snapshot A" }
}
```

### Pull pending snapshot in Blender add-on
- `GET /v1/camera/pending`
- `GET /v1/camera/pending?consume=1` (returns and clears pending snapshot)

Response:
```json
{
  "ok": true,
  "pendingSnapshot": {
    "name": "AI Canvas Snapshot A",
    "camera": "Camera.Main"
  },
  "pendingUpdatedAt": "2026-03-14T17:00:00.000Z"
}
```

### Import Blender camera states into AI Canvas
- `POST /v1/camera/states/import`

Request:
```json
{
  "source": "blender",
  "scene": "Shot_001",
  "activeCamera": "Camera.Main",
  "states": [
    {
      "name": "Camera.Main",
      "camera": "Camera.Main",
      "frame": 101,
      "lens": 50,
      "location": [1.2, -3.5, 2.0],
      "rotation_euler": [1.1, 0.1, 2.7],
      "resolution": { "width": 1920, "height": 1080, "percentage": 100 }
    }
  ]
}
```

## Sequence handoff endpoints (Phase 9h)

### Import frame sequence
- `POST /v1/sequence/import`

Request:
```json
{
  "source": "blender",
  "kind": "sequence",
  "scene": "Shot_001",
  "camera": "Camera.Main",
  "sequenceName": "Shot_001 Preview",
  "fps": 24,
  "startFrame": 1001,
  "frames": [
    { "frame": 1001, "timeMs": 0, "label": "shot_1001.png", "imagePath": "C:\\\\renders\\\\shot_1001.png" },
    { "frame": 1002, "timeMs": 42, "label": "shot_1002.png", "imagePath": "C:\\\\renders\\\\shot_1002.png" }
  ],
  "metadata": { "engine": "CYCLES" }
}
```

Response:
```json
{
  "ok": true,
  "sequenceId": "seq_20260314_001",
  "frameCount": 2,
  "message": "Sequence imported."
}
```

### List imported sequences
- `GET /v1/sequence/list`

Response includes sequence summaries with frame metadata (no eager full frame payloads).

## Electron IPC channels (app internal)
- `run-blender-embed-spike` (added in Phase 9a)
  - request: none
  - response: `{ ok, steps?, error? }`
- Planned channels for later phases:
  - `blender-process-start`
  - `blender-process-stop`
  - `blender-process-status`
  - `blender-embed-attach`
  - `blender-embed-detach`
  - `blender-bridge-health`
- Implemented bridge state channel:
  - `blender-bridge-get-state`
- Implemented camera bridge channels:
  - `blender-bridge-set-camera-snapshot`
  - `blender-bridge-get-camera-state`
- Implemented sequence bridge channels:
  - `blender-bridge-get-sequences`
  - `blender-bridge-get-sequence-frame`
- Implemented renderer event:
  - `blender-bridge-import` (push message with `passes[]`, `passSetId`, `metadata`)
  - `blender-bridge-camera-states` (push message with scene/active camera/states list)
  - `blender-bridge-sequence` (push message with sequence summary/timeline metadata)

## Error model
All endpoints should return:
```json
{
  "ok": false,
  "errorCode": "STRING_CODE",
  "message": "Human readable message"
}
```

Recommended error codes:
- `BRIDGE_UNAVAILABLE`
- `INVALID_PAYLOAD`
- `FILE_NOT_FOUND`
- `IMPORT_FAILED`
- `UNSUPPORTED_FORMAT`
- `INTERNAL_ERROR`

## Security baseline
- Bind only to loopback.
- Reject non-local origins by default.
- Do not execute arbitrary shell commands from payload.
- Validate file extension and size before import.
