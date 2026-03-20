const path = require('path');
const { spawn } = require('child_process');

let mainWindowRef = null;

const embedState = {
  embedded: false,
  pid: null,
  bounds: null,
  lastError: null,
  updatedAt: new Date().toISOString(),
};

function nowIso() {
  return new Date().toISOString();
}

function updateEmbedState(patch) {
  Object.assign(embedState, patch, { updatedAt: nowIso() });
}

function getStateSnapshot() {
  return { ...embedState };
}

function setMainWindow(mainWindow) {
  mainWindowRef = mainWindow;
}

function parseJsonOutput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { raw: trimmed };
  }
}

function getNativeHandleValue(handleBuffer) {
  if (!Buffer.isBuffer(handleBuffer)) {
    throw new Error('Invalid native handle buffer.');
  }
  if (handleBuffer.length >= 8) {
    return handleBuffer.readBigUInt64LE(0).toString();
  }
  if (handleBuffer.length >= 4) {
    return String(handleBuffer.readUInt32LE(0));
  }
  throw new Error('Unexpected native handle size.');
}

function normalizeBounds(bounds) {
  const source = bounds || {};
  const x = Number.isFinite(source.x) ? Math.round(source.x) : 0;
  const y = Number.isFinite(source.y) ? Math.round(source.y) : 0;
  const width = Number.isFinite(source.width) ? Math.max(64, Math.round(source.width)) : 640;
  const height = Number.isFinite(source.height) ? Math.max(64, Math.round(source.height)) : 480;
  return { x, y, width, height };
}

function runWinParentScript({ mode, childPid, parentHwnd, bounds, waitMs }) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'win-window-parent.ps1');
    const safeBounds = normalizeBounds(bounds);
    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath,
      '-Mode',
      mode,
      '-ChildPid',
      String(childPid),
      '-X',
      String(safeBounds.x),
      '-Y',
      String(safeBounds.y),
      '-Width',
      String(safeBounds.width),
      '-Height',
      String(safeBounds.height),
      '-WaitMs',
      String(Number.isFinite(waitMs) ? Math.max(500, waitMs) : 2200),
    ];

    if (parentHwnd) {
      args.push('-ParentHwnd', String(parentHwnd));
    }

    const child = spawn('powershell.exe', args, { windowsHide: true });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      if (code === 0) {
        resolve(parseJsonOutput(stdout));
        return;
      }
      reject(new Error(`win-window-parent.ps1 failed (${mode}) code=${code}: ${stderr || stdout}`));
    });
  });
}

async function attachToMainWindow(pid, bounds) {
  if (process.platform !== 'win32') {
    updateEmbedState({
      embedded: false,
      lastError: 'Embedding is currently supported only on Windows.',
    });
    return { ok: false, error: embedState.lastError, state: getStateSnapshot() };
  }
  if (!mainWindowRef || mainWindowRef.isDestroyed()) {
    updateEmbedState({
      embedded: false,
      lastError: 'Main window is unavailable for embedding.',
    });
    return { ok: false, error: embedState.lastError, state: getStateSnapshot() };
  }
  if (!Number.isFinite(pid) || pid <= 0) {
    updateEmbedState({
      embedded: false,
      lastError: 'Invalid Blender process id.',
    });
    return { ok: false, error: embedState.lastError, state: getStateSnapshot() };
  }

  try {
    const parentHwnd = getNativeHandleValue(mainWindowRef.getNativeWindowHandle());
    const safeBounds = normalizeBounds(bounds);
    const info = await runWinParentScript({
      mode: 'attach',
      childPid: pid,
      parentHwnd,
      bounds: safeBounds,
      waitMs: 3000,
    });
    const resolvedPid = Number(info && (info.resolvedPid || info.pid));
    updateEmbedState({
      embedded: true,
      pid: Number.isFinite(resolvedPid) && resolvedPid > 0 ? resolvedPid : pid,
      bounds: safeBounds,
      lastError: null,
    });
    return { ok: true, info, state: getStateSnapshot() };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    updateEmbedState({
      embedded: false,
      pid: null,
      bounds: null,
      lastError: message,
    });
    return { ok: false, error: message, state: getStateSnapshot() };
  }
}

async function syncEmbeddedBounds(bounds) {
  if (!embedState.embedded || !embedState.pid) {
    return { ok: false, error: 'No embedded process to sync.', state: getStateSnapshot() };
  }

  const safeBounds = normalizeBounds(bounds);
  try {
    await runWinParentScript({
      mode: 'position',
      childPid: embedState.pid,
      bounds: safeBounds,
      waitMs: 800,
    });
    updateEmbedState({
      bounds: safeBounds,
      lastError: null,
    });
    return { ok: true, state: getStateSnapshot() };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    updateEmbedState({
      embedded: false,
      pid: null,
      bounds: null,
      lastError: message,
    });
    return { ok: false, error: message, state: getStateSnapshot() };
  }
}

async function focusEmbeddedWindow() {
  if (!embedState.embedded || !embedState.pid) {
    return { ok: false, error: 'No embedded process to focus.', state: getStateSnapshot() };
  }

  try {
    await runWinParentScript({
      mode: 'focus',
      childPid: embedState.pid,
      bounds: embedState.bounds || { x: 0, y: 0, width: 640, height: 480 },
      waitMs: 800,
    });
    return { ok: true, state: getStateSnapshot() };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    updateEmbedState({
      lastError: message,
    });
    return { ok: false, error: message, state: getStateSnapshot() };
  }
}

async function detachEmbeddedWindow() {
  if (!embedState.pid) {
    updateEmbedState({
      embedded: false,
      pid: null,
      bounds: null,
    });
    return { ok: true, alreadyDetached: true, state: getStateSnapshot() };
  }

  const pid = embedState.pid;
  const fallbackBounds = embedState.bounds || { x: 100, y: 80, width: 1100, height: 740 };
  try {
    await runWinParentScript({
      mode: 'detach',
      childPid: pid,
      bounds: fallbackBounds,
      waitMs: 1000,
    });
  } catch (error) {
    // Process may have already exited; treat detach as best-effort.
  }

  updateEmbedState({
    embedded: false,
    pid: null,
    bounds: null,
  });
  return { ok: true, state: getStateSnapshot() };
}

function resetEmbedStateForProcessExit(pid) {
  if (!embedState.pid || embedState.pid !== pid) return;
  updateEmbedState({
    embedded: false,
    pid: null,
    bounds: null,
    lastError: 'Embedded process ended.',
  });
}

module.exports = {
  setEmbedMainWindow: setMainWindow,
  getBlenderEmbedState: getStateSnapshot,
  attachBlenderEmbed: attachToMainWindow,
  syncBlenderEmbedBounds: syncEmbeddedBounds,
  focusBlenderEmbed: focusEmbeddedWindow,
  detachBlenderEmbed: detachEmbeddedWindow,
  resetEmbedStateForProcessExit,
};
