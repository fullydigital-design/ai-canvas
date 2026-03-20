const http = require('http');
const fs = require('fs');
const path = require('path');

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8765;
const MAX_BODY_BYTES = 60 * 1024 * 1024;
const MAX_IMAGE_BYTES = 80 * 1024 * 1024;
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_PASS_COUNT = 16;
const MAX_CAMERA_STATES = 128;
const MAX_SEQUENCE_FRAMES = 600;
const MAX_SEQUENCE_CLIPS = 8;
const ALLOWED_PASS_TYPES = new Set([
  'beauty',
  'depth',
  'normal',
  'albedo',
  'object_id',
  'material_id',
  'custom',
]);

let server = null;
let onImportHandler = null;
let onCameraStatesHandler = null;
let onSequenceHandler = null;

const state = {
  running: false,
  host: DEFAULT_HOST,
  port: DEFAULT_PORT,
  lastError: null,
  importsCount: 0,
  lastImportAt: null,
  lastImportId: null,
  lastPassCount: null,
  lastPassTypes: null,
  cameraPendingSnapshot: null,
  cameraPendingUpdatedAt: null,
  cameraPendingConsumedAt: null,
  lastCameraStatesAt: null,
  lastCameraStatesCount: 0,
  lastCameraScene: null,
  lastCameraActive: null,
  sequencesCount: 0,
  lastSequenceImportAt: null,
  lastSequenceImportId: null,
  lastSequenceFrameCount: null,
};

const sequenceStore = new Map();
const sequenceOrder = [];

function nowIso() {
  return new Date().toISOString();
}

function getStateSnapshot() {
  return { ...state };
}

function setState(patch) {
  Object.assign(state, patch);
}

function isLoopbackAddress(address) {
  return (
    address === '127.0.0.1'
    || address === '::1'
    || address === '::ffff:127.0.0.1'
    || address === 'localhost'
  );
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Request body too large.'));
        try {
          req.destroy();
        } catch {
          // ignore
        }
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function parseRequestUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl || '/', 'http://127.0.0.1');
    return {
      pathname: parsed.pathname || '/',
      searchParams: parsed.searchParams,
    };
  } catch {
    return {
      pathname: '/',
      searchParams: new URLSearchParams(),
    };
  }
}

function toMimeType(ext) {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.bmp':
      return 'image/bmp';
    case '.gif':
      return 'image/gif';
    default:
      return null;
  }
}

function normalizeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') return null;
  const trimmed = dataUrl.trim();
  if (!trimmed.startsWith('data:image/')) return null;
  if (!trimmed.includes(';base64,')) return null;
  return trimmed;
}

function toFiniteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const next = Number(value);
    if (Number.isFinite(next)) return next;
  }
  return null;
}

function normalizeVector3(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const x = toFiniteNumber(value[0]);
  const y = toFiniteNumber(value[1]);
  const z = toFiniteNumber(value[2]);
  if (x === null || y === null || z === null) return null;
  return [x, y, z];
}

function normalizeResolution(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const width = toFiniteNumber(value.width);
  const height = toFiniteNumber(value.height);
  const percentage = toFiniteNumber(value.percentage);
  if (width === null || height === null) return null;
  const normalized = {
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
  if (percentage !== null) {
    normalized.percentage = Math.max(1, Math.min(500, Math.round(percentage)));
  }
  return normalized;
}

function normalizeCameraSnapshot(snapshot, fallbackName) {
  const source = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {};
  const name =
    typeof source.name === 'string' && source.name.trim()
      ? source.name.trim().slice(0, 96)
      : (fallbackName || 'AI Canvas Snapshot').slice(0, 96);
  const camera =
    typeof source.camera === 'string' && source.camera.trim()
      ? source.camera.trim().slice(0, 128)
      : null;
  const frame = toFiniteNumber(source.frame);
  const lens = toFiniteNumber(source.lens);
  const location = normalizeVector3(source.location);
  const rotationEuler = normalizeVector3(
    source.rotation_euler || source.rotationEuler || source.rotation,
  );
  const resolution = normalizeResolution(source.resolution);

  return {
    name,
    camera,
    frame: frame === null ? null : Math.max(0, Math.round(frame)),
    lens: lens === null ? null : lens,
    location,
    rotation_euler: rotationEuler,
    resolution,
  };
}

function setPendingCameraSnapshot(snapshot) {
  const normalized = normalizeCameraSnapshot(snapshot, snapshot && snapshot.name ? String(snapshot.name) : 'AI Canvas Snapshot');
  setState({
    cameraPendingSnapshot: normalized,
    cameraPendingUpdatedAt: nowIso(),
    cameraPendingConsumedAt: null,
    lastError: null,
  });
  return {
    ok: true,
    snapshot: normalized,
    updatedAt: state.cameraPendingUpdatedAt,
  };
}

function consumePendingCameraSnapshot() {
  const pending = state.cameraPendingSnapshot || null;
  const consumedAt = nowIso();
  setState({
    cameraPendingSnapshot: null,
    cameraPendingConsumedAt: consumedAt,
  });
  return {
    snapshot: pending,
    consumedAt,
  };
}

function getCameraBridgeState() {
  return {
    pendingSnapshot: state.cameraPendingSnapshot,
    pendingUpdatedAt: state.cameraPendingUpdatedAt,
    pendingConsumedAt: state.cameraPendingConsumedAt,
    lastCameraStatesAt: state.lastCameraStatesAt,
    lastCameraStatesCount: state.lastCameraStatesCount,
    lastCameraScene: state.lastCameraScene,
    lastCameraActive: state.lastCameraActive,
  };
}

function normalizeSequenceName(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 96);
  }
  return fallback.slice(0, 96);
}

function normalizeSequenceFrameEntry(entry, index, startFrame, fps) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Invalid frame entry at index ${index}.`);
  }

  const { dataUrl, imagePath } = coercePathOrDataUrl(entry.imagePath || entry.dataUrl || entry.imageDataUrl || entry.imageData || entry.path);
  if (!dataUrl && !imagePath) {
    throw new Error(`Frame ${index + 1} is missing imagePath or dataUrl.`);
  }

  let resolvedPath = null;
  if (imagePath) {
    resolvedPath = path.resolve(imagePath);
    const ext = path.extname(resolvedPath).toLowerCase();
    const mimeType = toMimeType(ext);
    if (!mimeType) {
      throw new Error(`Unsupported sequence frame format: ${ext || 'unknown'}`);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Sequence frame does not exist: ${resolvedPath}`);
    }
    const stat = fs.statSync(resolvedPath);
    if (stat.size > MAX_IMAGE_BYTES) {
      throw new Error(`Sequence frame is too large (${Math.round(stat.size / 1024 / 1024)} MB): ${resolvedPath}`);
    }
  }

  const frameValue = toFiniteNumber(entry.frame);
  const frame = frameValue === null ? startFrame + index : Math.max(0, Math.round(frameValue));
  const timeMsValue = toFiniteNumber(entry.timeMs);
  const timeMs =
    timeMsValue === null
      ? Math.round(((frame - startFrame) / Math.max(1, fps)) * 1000)
      : Math.max(0, Math.round(timeMsValue));
  const label =
    typeof entry.label === 'string' && entry.label.trim()
      ? entry.label.trim().slice(0, 96)
      : resolvedPath
        ? path.basename(resolvedPath)
        : `Frame ${frame}`;

  return {
    index,
    frame,
    timeMs,
    label,
    imagePath: resolvedPath,
    dataUrl: dataUrl || null,
    width: toFiniteNumber(entry.width),
    height: toFiniteNumber(entry.height),
    error: null,
  };
}

function normalizeSequencePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Sequence payload must be a JSON object.');
  }
  if (!Array.isArray(payload.frames) || !payload.frames.length) {
    throw new Error('Sequence payload must include a non-empty frames array.');
  }
  if (payload.frames.length > MAX_SEQUENCE_FRAMES) {
    throw new Error(`Too many sequence frames (${payload.frames.length}). Maximum is ${MAX_SEQUENCE_FRAMES}.`);
  }

  const startFrameValue = toFiniteNumber(payload.startFrame);
  const startFrame = startFrameValue === null ? 1 : Math.max(0, Math.round(startFrameValue));
  const fpsValue = toFiniteNumber(payload.fps);
  const fps = fpsValue === null ? 24 : Math.max(1, Math.min(240, Math.round(fpsValue)));
  const sequenceName = normalizeSequenceName(
    payload.sequenceName || payload.name,
    `Blender Sequence ${new Date().toISOString().slice(11, 19)}`,
  );

  const frames = payload.frames.map((frameEntry, index) =>
    normalizeSequenceFrameEntry(frameEntry, index, startFrame, fps),
  );
  frames.sort((a, b) => a.frame - b.frame || a.index - b.index);
  for (let i = 0; i < frames.length; i += 1) {
    frames[i].index = i;
  }

  return {
    source: payload.source || 'blender',
    kind: 'sequence',
    sequenceName,
    scene:
      typeof payload.scene === 'string' && payload.scene.trim()
        ? payload.scene.trim().slice(0, 128)
        : null,
    camera:
      typeof payload.camera === 'string' && payload.camera.trim()
        ? payload.camera.trim().slice(0, 128)
        : null,
    fps,
    startFrame,
    metadata: payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)
      ? payload.metadata
      : {},
    frames,
  };
}

function setSequenceClip(clip) {
  if (!clip || typeof clip !== 'object') return;
  sequenceStore.set(clip.sequenceId, clip);
  const existingIndex = sequenceOrder.indexOf(clip.sequenceId);
  if (existingIndex >= 0) {
    sequenceOrder.splice(existingIndex, 1);
  }
  sequenceOrder.unshift(clip.sequenceId);
  while (sequenceOrder.length > MAX_SEQUENCE_CLIPS) {
    const removedId = sequenceOrder.pop();
    if (removedId) {
      sequenceStore.delete(removedId);
    }
  }

  setState({
    sequencesCount: sequenceOrder.length,
    lastSequenceImportAt: clip.receivedAt || nowIso(),
    lastSequenceImportId: clip.sequenceId,
    lastSequenceFrameCount: clip.frameCount,
  });
}

function buildSequenceSummary(clip) {
  return {
    sequenceId: clip.sequenceId,
    source: clip.source,
    kind: 'sequence',
    sequenceName: clip.sequenceName,
    scene: clip.scene,
    camera: clip.camera,
    fps: clip.fps,
    startFrame: clip.startFrame,
    endFrame: clip.endFrame,
    frameCount: clip.frameCount,
    frames: clip.frames.map((frame) => ({
      index: frame.index,
      frame: frame.frame,
      timeMs: frame.timeMs,
      label: frame.label,
      width: Number.isFinite(frame.width) ? frame.width : null,
      height: Number.isFinite(frame.height) ? frame.height : null,
      hasDataUrl: !!frame.dataUrl,
    })),
    metadata: clip.metadata,
    receivedAt: clip.receivedAt,
  };
}

function getSequenceSummaries() {
  return sequenceOrder
    .map((id) => sequenceStore.get(id))
    .filter(Boolean)
    .map((clip) => buildSequenceSummary(clip));
}

async function getSequenceFrameData(sequenceId, frameIndex) {
  if (typeof sequenceId !== 'string' || !sequenceId.trim()) {
    throw new Error('sequenceId is required.');
  }
  const clip = sequenceStore.get(sequenceId.trim());
  if (!clip) {
    throw new Error(`Sequence not found: ${sequenceId}`);
  }

  const index = Math.max(0, Math.round(Number(frameIndex) || 0));
  const frame = clip.frames[index];
  if (!frame) {
    throw new Error(`Frame index out of range: ${index}`);
  }

  if (frame.dataUrl) {
    return {
      sequenceId: clip.sequenceId,
      sequenceName: clip.sequenceName,
      frameIndex: index,
      frame: frame.frame,
      timeMs: frame.timeMs,
      label: frame.label,
      dataUrl: frame.dataUrl,
      width: Number.isFinite(frame.width) ? frame.width : null,
      height: Number.isFinite(frame.height) ? frame.height : null,
    };
  }

  if (!frame.imagePath) {
    throw new Error('Frame has neither cached dataUrl nor imagePath.');
  }

  const ext = path.extname(frame.imagePath).toLowerCase();
  const mimeType = toMimeType(ext);
  if (!mimeType) {
    throw new Error(`Unsupported frame format: ${ext || 'unknown'}`);
  }
  const buffer = await fs.promises.readFile(frame.imagePath);
  frame.dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return {
    sequenceId: clip.sequenceId,
    sequenceName: clip.sequenceName,
    frameIndex: index,
    frame: frame.frame,
    timeMs: frame.timeMs,
    label: frame.label,
    dataUrl: frame.dataUrl,
    width: Number.isFinite(frame.width) ? frame.width : null,
    height: Number.isFinite(frame.height) ? frame.height : null,
  };
}

function normalizePassType(value) {
  if (typeof value !== 'string') return 'custom';
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) return 'custom';
  if (normalized === 'objectid' || normalized === 'object') return 'object_id';
  if (normalized === 'materialid' || normalized === 'material') return 'material_id';
  if (ALLOWED_PASS_TYPES.has(normalized)) return normalized;
  return 'custom';
}

function normalizePassName(value, fallbackType, index) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim().slice(0, 80);
  }
  return `${fallbackType.toUpperCase()} Pass ${index + 1}`;
}

function coercePathOrDataUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return {};
  const trimmed = value.trim();
  if (normalizeDataUrl(trimmed)) {
    return { dataUrl: trimmed };
  }
  return { imagePath: trimmed };
}

function coercePassEntries(payload) {
  const entries = [];

  if (Array.isArray(payload.passes)) {
    for (const pass of payload.passes) {
      if (pass && typeof pass === 'object') {
        entries.push(pass);
      }
    }
  }

  if (payload.passFiles && typeof payload.passFiles === 'object' && !Array.isArray(payload.passFiles)) {
    for (const [passType, rawValue] of Object.entries(payload.passFiles)) {
      if (!rawValue) continue;
      if (typeof rawValue === 'string') {
        entries.push({ passType, ...coercePathOrDataUrl(rawValue) });
        continue;
      }
      if (typeof rawValue === 'object') {
        entries.push({ passType, ...rawValue });
      }
    }
  }

  if (!entries.length) {
    entries.push({
      passType: payload.passType || 'beauty',
      name: payload.passName || payload.layerName || 'Beauty',
      imagePath: payload.imagePath,
      dataUrl: payload.imageDataUrl || payload.imageData || payload.dataUrl,
    });
  }

  return entries;
}

async function parseMetadata(payload) {
  const metadata = {};

  if (typeof payload.metadataPath === 'string' && payload.metadataPath.trim()) {
    const metadataPath = path.resolve(payload.metadataPath.trim());
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Metadata file does not exist: ${metadataPath}`);
    }
    const stat = fs.statSync(metadataPath);
    if (stat.size > MAX_METADATA_BYTES) {
      throw new Error(`Metadata file is too large (${Math.round(stat.size / 1024)} KB).`);
    }
    const raw = await fs.promises.readFile(metadataPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Metadata file must contain a JSON object.');
    }
    Object.assign(metadata, parsed);
  }

  if (payload.metadata && typeof payload.metadata === 'object' && !Array.isArray(payload.metadata)) {
    Object.assign(metadata, payload.metadata);
  }

  return metadata;
}

async function resolveDataUrl(payload) {
  const fromDataUrl = normalizeDataUrl(payload.imageDataUrl || payload.imageData || payload.dataUrl);
  if (fromDataUrl) {
    return fromDataUrl;
  }

  if (typeof payload.imagePath !== 'string' || !payload.imagePath.trim()) {
    throw new Error('Missing imagePath or imageDataUrl.');
  }

  const imagePath = path.resolve(payload.imagePath.trim());
  const ext = path.extname(imagePath).toLowerCase();
  const mimeType = toMimeType(ext);
  if (!mimeType) {
    throw new Error(`Unsupported image format: ${ext || 'unknown'}`);
  }
  if (!fs.existsSync(imagePath)) {
    throw new Error(`Image file does not exist: ${imagePath}`);
  }

  const stat = fs.statSync(imagePath);
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image file is too large (${Math.round(stat.size / 1024 / 1024)} MB).`);
  }

  const buffer = await fs.promises.readFile(imagePath);
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function resolvePasses(payload) {
  const entries = coercePassEntries(payload);
  if (!entries.length) {
    throw new Error('No pass entries found.');
  }
  if (entries.length > MAX_PASS_COUNT) {
    throw new Error(`Too many passes provided (${entries.length}). Maximum is ${MAX_PASS_COUNT}.`);
  }

  const resolved = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const passType = normalizePassType(entry.passType || entry.type || entry.kind);
    const name = normalizePassName(entry.name || entry.layerName, passType, i);
    const dataUrl = await resolveDataUrl({
      imageDataUrl: entry.dataUrl || entry.imageDataUrl || entry.imageData,
      imagePath: entry.imagePath,
    });
    resolved.push({
      passType,
      name,
      dataUrl,
    });
  }

  return resolved;
}

async function handleImportRequest(req, res) {
  try {
    const payload = await parseRequestBody(req);
    const passes = await resolvePasses(payload);
    const metadata = await parseMetadata(payload);
    const importId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const groupName =
      typeof payload.groupName === 'string' && payload.groupName.trim()
        ? payload.groupName.trim()
        : (typeof payload.layerName === 'string' && payload.layerName.trim() ? payload.layerName.trim() : null);
    const passSetId =
      typeof payload.passSetId === 'string' && payload.passSetId.trim()
        ? payload.passSetId.trim()
        : `ps_${importId}`;
    const declaredKind = typeof payload.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
    const kind = declaredKind || (passes.length > 1 ? 'pass_set' : 'final_render');

    const importMessage = {
      importId,
      passSetId,
      source: payload.source || 'blender',
      kind,
      layerName: payload.layerName || null,
      groupName,
      dataUrl: passes[0].dataUrl,
      passes,
      metadata,
      receivedAt: nowIso(),
    };

    if (typeof onImportHandler !== 'function') {
      sendJson(res, 503, {
        ok: false,
        errorCode: 'BRIDGE_UNAVAILABLE',
        message: 'Bridge import handler is unavailable.',
      });
      return;
    }

    await Promise.resolve(onImportHandler(importMessage));
    setState({
      importsCount: state.importsCount + 1,
      lastImportAt: nowIso(),
      lastImportId: importId,
      lastPassCount: passes.length,
      lastPassTypes: [...new Set(passes.map((pass) => pass.passType))].slice(0, 8),
      lastError: null,
    });

    sendJson(res, 200, {
      ok: true,
      importId,
      passCount: passes.length,
      message: 'Render queued for import',
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setState({ lastError: message });
    sendJson(res, 400, {
      ok: false,
      errorCode: 'IMPORT_FAILED',
      message,
    });
  }
}

async function handleSetCameraSnapshot(req, res) {
  try {
    const payload = await parseRequestBody(req);
    const candidate = payload.snapshot && typeof payload.snapshot === 'object' ? payload.snapshot : payload;
    const result = setPendingCameraSnapshot(candidate);
    sendJson(res, 200, {
      ok: true,
      message: 'Camera snapshot queued for Blender add-on pull.',
      pendingSnapshot: result.snapshot,
      pendingUpdatedAt: result.updatedAt,
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setState({ lastError: message });
    sendJson(res, 400, {
      ok: false,
      errorCode: 'CAMERA_SNAPSHOT_FAILED',
      message,
    });
  }
}

function handleGetCameraPending(res, searchParams) {
  const consumeRaw = (searchParams && searchParams.get('consume')) || '';
  const consume = ['1', 'true', 'yes'].includes(String(consumeRaw).toLowerCase());
  const snapshot = state.cameraPendingSnapshot || null;

  if (consume) {
    const consumed = consumePendingCameraSnapshot();
    sendJson(res, 200, {
      ok: true,
      pendingSnapshot: consumed.snapshot,
      pendingUpdatedAt: state.cameraPendingUpdatedAt,
      consumedAt: consumed.consumedAt,
    });
    return;
  }

  sendJson(res, 200, {
    ok: true,
    pendingSnapshot: snapshot,
    pendingUpdatedAt: state.cameraPendingUpdatedAt,
    consumedAt: state.cameraPendingConsumedAt,
  });
}

async function handleImportCameraStates(req, res) {
  try {
    const payload = await parseRequestBody(req);
    if (!Array.isArray(payload.states)) {
      throw new Error('Camera states payload must include a states array.');
    }
    if (payload.states.length > MAX_CAMERA_STATES) {
      throw new Error(`Too many camera states (${payload.states.length}). Maximum is ${MAX_CAMERA_STATES}.`);
    }

    const normalizedStates = payload.states
      .map((entry, index) => normalizeCameraSnapshot(entry, `Camera ${index + 1}`))
      .filter((entry) => !!entry.name);

    const cameraPayload = {
      source: payload.source || 'blender',
      scene:
        typeof payload.scene === 'string' && payload.scene.trim()
          ? payload.scene.trim().slice(0, 128)
          : null,
      activeCamera:
        typeof payload.activeCamera === 'string' && payload.activeCamera.trim()
          ? payload.activeCamera.trim().slice(0, 128)
          : null,
      states: normalizedStates,
      receivedAt: nowIso(),
    };

    if (typeof onCameraStatesHandler === 'function') {
      await Promise.resolve(onCameraStatesHandler(cameraPayload));
    }

    setState({
      lastCameraStatesAt: cameraPayload.receivedAt,
      lastCameraStatesCount: normalizedStates.length,
      lastCameraScene: cameraPayload.scene,
      lastCameraActive: cameraPayload.activeCamera,
      lastError: null,
    });

    sendJson(res, 200, {
      ok: true,
      statesCount: normalizedStates.length,
      message: 'Camera states imported.',
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setState({ lastError: message });
    sendJson(res, 400, {
      ok: false,
      errorCode: 'CAMERA_STATES_IMPORT_FAILED',
      message,
    });
  }
}

async function handleImportSequence(req, res) {
  try {
    const payload = await parseRequestBody(req);
    const normalized = normalizeSequencePayload(payload);
    const sequenceId = `seq_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const receivedAt = nowIso();
    const frameCount = normalized.frames.length;
    const endFrame = normalized.frames.length
      ? normalized.frames[normalized.frames.length - 1].frame
      : normalized.startFrame;

    const clip = {
      sequenceId,
      source: normalized.source,
      sequenceName: normalized.sequenceName,
      scene: normalized.scene,
      camera: normalized.camera,
      fps: normalized.fps,
      startFrame: normalized.startFrame,
      endFrame,
      frameCount,
      metadata: normalized.metadata,
      frames: normalized.frames,
      receivedAt,
    };

    setSequenceClip(clip);
    const summary = buildSequenceSummary(clip);

    if (typeof onSequenceHandler === 'function') {
      await Promise.resolve(onSequenceHandler(summary));
    }

    setState({ lastError: null });
    sendJson(res, 200, {
      ok: true,
      sequenceId,
      frameCount,
      message: 'Sequence imported.',
    });
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    setState({ lastError: message });
    sendJson(res, 400, {
      ok: false,
      errorCode: 'SEQUENCE_IMPORT_FAILED',
      message,
    });
  }
}

function createRequestHandler() {
  return async (req, res) => {
    const remoteAddress = req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : '';
    if (!isLoopbackAddress(remoteAddress)) {
      sendJson(res, 403, {
        ok: false,
        errorCode: 'FORBIDDEN_REMOTE',
        message: `Bridge accepts loopback requests only (got ${remoteAddress || 'unknown'}).`,
      });
      return;
    }

    const method = (req.method || 'GET').toUpperCase();
    const { pathname, searchParams } = parseRequestUrl(req.url);

    if (method === 'GET' && pathname === '/health') {
      sendJson(res, 200, {
        ok: true,
        service: 'ai-canvas-blender-bridge',
        version: '0.1.0',
        host: state.host,
        port: state.port,
        importsCount: state.importsCount,
        lastImportAt: state.lastImportAt,
        lastImportId: state.lastImportId,
        cameraPendingUpdatedAt: state.cameraPendingUpdatedAt,
        lastCameraStatesAt: state.lastCameraStatesAt,
        lastCameraStatesCount: state.lastCameraStatesCount,
        sequencesCount: state.sequencesCount,
        lastSequenceImportAt: state.lastSequenceImportAt,
        lastSequenceImportId: state.lastSequenceImportId,
        lastSequenceFrameCount: state.lastSequenceFrameCount,
      });
      return;
    }

    if (method === 'POST' && pathname === '/v1/render/import') {
      await handleImportRequest(req, res);
      return;
    }

    if (method === 'POST' && pathname === '/v1/render/import-pass-set') {
      await handleImportRequest(req, res);
      return;
    }

    if (method === 'POST' && pathname === '/v1/camera/snapshot') {
      await handleSetCameraSnapshot(req, res);
      return;
    }

    if (method === 'GET' && pathname === '/v1/camera/pending') {
      handleGetCameraPending(res, searchParams);
      return;
    }

    if (method === 'POST' && pathname === '/v1/camera/states/import') {
      await handleImportCameraStates(req, res);
      return;
    }

    if (method === 'POST' && pathname === '/v1/sequence/import') {
      await handleImportSequence(req, res);
      return;
    }

    if (method === 'GET' && pathname === '/v1/sequence/list') {
      sendJson(res, 200, {
        ok: true,
        sequences: getSequenceSummaries(),
      });
      return;
    }

    sendJson(res, 404, {
      ok: false,
      errorCode: 'NOT_FOUND',
      message: `No route for ${method} ${pathname}`,
    });
  };
}

async function startBlenderBridgeServer(options = {}) {
  if (server) {
    return { ok: true, alreadyRunning: true, state: getStateSnapshot() };
  }

  const host = options.host || DEFAULT_HOST;
  const port = Number.isFinite(options.port) ? options.port : DEFAULT_PORT;
  onImportHandler = options.onImport || null;
  onCameraStatesHandler = options.onCameraStates || null;
  onSequenceHandler = options.onSequence || null;

  return new Promise((resolve) => {
    const requestHandler = createRequestHandler();
    const nextServer = http.createServer(requestHandler);
    nextServer.on('error', (error) => {
      const message = error && error.message ? error.message : String(error);
      setState({
        running: false,
        host,
        port,
        lastError: message,
      });
      resolve({ ok: false, error: message, state: getStateSnapshot() });
    });

    nextServer.listen(port, host, () => {
      server = nextServer;
      setState({
        running: true,
        host,
        port,
        lastError: null,
      });
      resolve({ ok: true, state: getStateSnapshot() });
    });
  });
}

async function stopBlenderBridgeServer() {
  if (!server) {
    setState({ running: false });
    return { ok: true, alreadyStopped: true, state: getStateSnapshot() };
  }
  const activeServer = server;
  server = null;
  return new Promise((resolve) => {
    activeServer.close(() => {
      setState({ running: false });
      resolve({ ok: true, state: getStateSnapshot() });
    });
  });
}

function getBlenderBridgeState() {
  return getStateSnapshot();
}

module.exports = {
  startBlenderBridgeServer,
  stopBlenderBridgeServer,
  getBlenderBridgeState,
  setPendingCameraSnapshot,
  getCameraBridgeState,
  getSequenceSummaries,
  getSequenceFrameData,
};
