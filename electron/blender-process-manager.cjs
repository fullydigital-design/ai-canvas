const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const STALE_MATCH_TIME_TOLERANCE_MS = 90 * 1000;

let appRef = null;
let configPath = null;
let blenderProcess = null;
let watchdogTimer = null;
const processExitListeners = new Set();
let persistedConfig = {
  executablePath: '',
  lastManagedProcess: null,
};

const state = {
  status: 'not_installed',
  executablePath: '',
  isRunning: false,
  pid: null,
  version: null,
  lastError: null,
  lastExitCode: null,
  lastExitSignal: null,
  startedAt: null,
  lastRecoveryNote: null,
  updatedAt: new Date().toISOString(),
};

function nowIso() {
  return new Date().toISOString();
}

function updateState(patch) {
  Object.assign(state, patch, { updatedAt: nowIso() });
}

function getStateSnapshot() {
  return { ...state };
}

function getDefaultStatusForPath(executablePath) {
  return executablePath ? 'ready' : 'not_installed';
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJsonSafe(filePath, value) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[blender-process] Failed to write config:', error && error.message ? error.message : String(error));
  }
}

function normalizeManagedProcessRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return null;
  const pid = Number(record.pid);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const startedAt = typeof record.startedAt === 'string' && record.startedAt ? record.startedAt : null;
  const executablePath = normalizeExecutablePath(record.executablePath || '');
  return {
    pid: Math.round(pid),
    startedAt,
    executablePath,
  };
}

function readPersistedConfig() {
  const next = readJsonSafe(configPath) || {};
  persistedConfig = {
    executablePath: normalizeExecutablePath(next.executablePath || ''),
    lastManagedProcess: normalizeManagedProcessRecord(next.lastManagedProcess),
  };
  return persistedConfig;
}

function writePersistedConfig() {
  if (!configPath) return;
  writeJsonSafe(configPath, persistedConfig);
}

function persistExecutablePath(executablePath) {
  persistedConfig.executablePath = normalizeExecutablePath(executablePath || '');
  writePersistedConfig();
}

function persistManagedProcess(record) {
  persistedConfig.lastManagedProcess = normalizeManagedProcessRecord(record);
  writePersistedConfig();
}

function normalizeForCompare(value) {
  return String(value || '').trim().toLowerCase();
}

function queryWindowsProcessInfo(pid) {
  if (process.platform !== 'win32') return null;
  if (!Number.isFinite(pid) || pid <= 0) return null;
  const command = [
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId = ${Math.round(pid)}" -ErrorAction SilentlyContinue;`,
    'if ($null -eq $p) { return }',
    '$startedAt = $null;',
    'try { $startedAt = [Management.ManagementDateTimeConverter]::ToDateTime($p.CreationDate).ToString("o") } catch {}',
    '[pscustomobject]@{',
    '  pid = $p.ProcessId;',
    '  name = $p.Name;',
    '  path = $p.ExecutablePath;',
    '  startedAt = $startedAt',
    '} | ConvertTo-Json -Compress',
  ].join(' ');

  const result = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
    windowsHide: true,
    encoding: 'utf-8',
  });
  if (result.error) return null;
  const stdout = String(result.stdout || '').trim();
  if (!stdout) return null;
  try {
    const parsed = JSON.parse(stdout);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      pid: Number(parsed.pid),
      name: typeof parsed.name === 'string' ? parsed.name : '',
      path: typeof parsed.path === 'string' ? parsed.path : '',
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : null,
    };
  } catch {
    return null;
  }
}

function killWindowsProcessTree(pid) {
  if (process.platform !== 'win32') return false;
  if (!Number.isFinite(pid) || pid <= 0) return false;
  const result = spawnSync('taskkill', ['/PID', String(Math.round(pid)), '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function maybeCleanupStaleManagedProcess(record) {
  const normalized = normalizeManagedProcessRecord(record);
  if (!normalized) return null;

  if (process.platform !== 'win32') {
    return { status: 'skipped_non_windows', pid: normalized.pid };
  }

  const procInfo = queryWindowsProcessInfo(normalized.pid);
  if (!procInfo) {
    return { status: 'not_running', pid: normalized.pid };
  }

  const processName = normalizeForCompare(procInfo.name);
  if (processName !== 'blender.exe') {
    return {
      status: 'mismatch_name',
      pid: normalized.pid,
      name: procInfo.name || 'unknown',
    };
  }

  if (normalized.executablePath && procInfo.path) {
    if (normalizeForCompare(normalized.executablePath) !== normalizeForCompare(procInfo.path)) {
      return {
        status: 'mismatch_path',
        pid: normalized.pid,
      };
    }
  }

  const expectedStartMs = normalized.startedAt ? Date.parse(normalized.startedAt) : Number.NaN;
  const actualStartMs = procInfo.startedAt ? Date.parse(procInfo.startedAt) : Number.NaN;
  if (Number.isFinite(expectedStartMs) && Number.isFinite(actualStartMs)) {
    if (Math.abs(actualStartMs - expectedStartMs) > STALE_MATCH_TIME_TOLERANCE_MS) {
      return {
        status: 'mismatch_start_time',
        pid: normalized.pid,
      };
    }
  }

  const killed = killWindowsProcessTree(normalized.pid);
  return {
    status: killed ? 'killed' : 'kill_failed',
    pid: normalized.pid,
  };
}

function formatRecoveryNote(report) {
  if (!report || !report.status) return null;
  switch (report.status) {
    case 'killed':
      return `Recovered stale Blender process PID ${report.pid} from previous session.`;
    case 'kill_failed':
      return `Detected stale Blender process PID ${report.pid}, but failed to terminate it automatically.`;
    case 'mismatch_name':
      return `Skipped stale cleanup for PID ${report.pid} (unexpected process name: ${report.name || 'unknown'}).`;
    case 'mismatch_path':
      return `Skipped stale cleanup for PID ${report.pid} (executable path mismatch).`;
    case 'mismatch_start_time':
      return `Skipped stale cleanup for PID ${report.pid} (start time mismatch).`;
    case 'skipped_non_windows':
      return 'Stale-process auto-cleanup is currently implemented for Windows only.';
    default:
      return null;
  }
}

function clearWatchdog() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

function ensureWatchdog() {
  if (watchdogTimer) return;
  watchdogTimer = setInterval(() => {
    if (!blenderProcess) return;
    if (blenderProcess.exitCode !== null) return;

    try {
      process.kill(blenderProcess.pid, 0);
    } catch {
      console.warn('[blender-process] Watchdog detected orphaned Blender process state, resetting.');
      blenderProcess = null;
      persistManagedProcess(null);
      updateState({
        status: getDefaultStatusForPath(state.executablePath),
        isRunning: false,
        pid: null,
      });
    }
  }, 2500);
}

function attachLifecycleHandlers(child) {
  child.once('exit', (code, signal) => {
    if (blenderProcess !== child) return;
    const exitedPid = child.pid || null;
    blenderProcess = null;
    persistManagedProcess(null);
    updateState({
      status: getDefaultStatusForPath(state.executablePath),
      isRunning: false,
      pid: null,
      lastExitCode: code,
      lastExitSignal: signal,
    });
    if (exitedPid) {
      processExitListeners.forEach((listener) => {
        try {
          listener(exitedPid, { code, signal });
        } catch {
          // ignore listener errors
        }
      });
    }
  });

  child.once('error', (error) => {
    if (blenderProcess !== child) return;
    const message = error && error.message ? error.message : String(error);
    blenderProcess = null;
    persistManagedProcess(null);
    updateState({
      status: 'error',
      isRunning: false,
      pid: null,
      lastError: message,
    });
  });
}

function normalizeExecutablePath(inputPath) {
  return String(inputPath || '').trim();
}

async function validateExecutablePath(pathToCheck) {
  const targetPath = normalizeExecutablePath(pathToCheck || state.executablePath);
  if (!targetPath) {
    return {
      ok: false,
      code: 'EMPTY_PATH',
      message: 'Blender executable path is empty.',
    };
  }

  if (!fs.existsSync(targetPath)) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: `File does not exist: ${targetPath}`,
    };
  }

  if (process.platform === 'win32' && path.extname(targetPath).toLowerCase() !== '.exe') {
    return {
      ok: false,
      code: 'NOT_EXECUTABLE',
      message: 'On Windows, Blender path must point to blender.exe.',
    };
  }

  return new Promise((resolve) => {
    let settled = false;
    const child = spawn(targetPath, ['--version'], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try {
        child.kill('SIGTERM');
      } catch {
        // ignore
      }
      resolve({
        ok: false,
        code: 'VALIDATION_TIMEOUT',
        message: 'Timed out while checking Blender executable.',
      });
    }, 5000);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        ok: false,
        code: 'SPAWN_ERROR',
        message: error && error.message ? error.message : String(error),
      });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code !== 0) {
        resolve({
          ok: false,
          code: 'INVALID_EXECUTABLE',
          message: stderr.trim() || `Executable returned non-zero exit code: ${code}`,
        });
        return;
      }
      const mergedOutput = `${stdout}\n${stderr}`.trim();
      const versionLine = mergedOutput
        .split(/\r?\n/)
        .find((line) => /blender/i.test(line))
        || '';
      resolve({
        ok: true,
        code: 'OK',
        message: 'Executable is valid.',
        version: versionLine || null,
      });
    });
  });
}

function setExecutablePath(executablePath) {
  const normalized = normalizeExecutablePath(executablePath);
  state.executablePath = normalized;
  persistExecutablePath(normalized);
  if (!state.isRunning) {
    state.status = getDefaultStatusForPath(normalized);
    state.updatedAt = nowIso();
  }
  return getStateSnapshot();
}

async function startProcess(options = {}) {
  const requestedPath = normalizeExecutablePath(options.path || state.executablePath);
  if (!requestedPath) {
    updateState({
      status: 'not_installed',
      lastError: 'Set Blender executable path before launching.',
    });
    return { ok: false, error: state.lastError, state: getStateSnapshot() };
  }

  if (blenderProcess && state.isRunning) {
    return { ok: true, alreadyRunning: true, state: getStateSnapshot() };
  }

  const validation = await validateExecutablePath(requestedPath);
  if (!validation.ok) {
    updateState({
      status: 'error',
      lastError: validation.message,
    });
    return { ok: false, error: validation.message, code: validation.code, state: getStateSnapshot() };
  }

  setExecutablePath(requestedPath);
  updateState({
    status: 'launching',
    lastError: null,
    version: validation.version || state.version || null,
  });

  try {
    const child = spawn(requestedPath, [], {
      cwd: path.dirname(requestedPath),
      windowsHide: false,
      detached: false,
      stdio: 'ignore',
    });
    blenderProcess = child;
    attachLifecycleHandlers(child);
    ensureWatchdog();
    const startedAt = nowIso();
    persistManagedProcess({
      pid: child.pid || null,
      executablePath: requestedPath,
      startedAt,
    });
    updateState({
      status: 'detached',
      isRunning: true,
      pid: child.pid || null,
      startedAt,
      lastError: null,
    });
    return { ok: true, state: getStateSnapshot() };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    blenderProcess = null;
    persistManagedProcess(null);
    updateState({
      status: 'error',
      isRunning: false,
      pid: null,
      lastError: message,
    });
    return { ok: false, error: message, state: getStateSnapshot() };
  }
}

async function stopProcess(options = {}) {
  if (!blenderProcess || !state.isRunning) {
    persistManagedProcess(null);
    updateState({
      isRunning: false,
      pid: null,
      status: getDefaultStatusForPath(state.executablePath),
    });
    return { ok: true, alreadyStopped: true, state: getStateSnapshot() };
  }

  const child = blenderProcess;
  const gracefulTimeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(500, options.timeoutMs) : 4000;

  return new Promise((resolve) => {
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const cleanupAndFinish = () => {
      finish({ ok: true, state: getStateSnapshot() });
    };

    const forceKillTimer = setTimeout(() => {
      if (settled) return;
      try {
        child.kill('SIGKILL');
      } catch {
        // ignore
      }
      cleanupAndFinish();
    }, gracefulTimeoutMs);

    child.once('exit', () => {
      clearTimeout(forceKillTimer);
      cleanupAndFinish();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(forceKillTimer);
      cleanupAndFinish();
    }
  });
}

async function restartProcess() {
  await stopProcess();
  return startProcess();
}

async function shutdownProcessManager() {
  clearWatchdog();
  await stopProcess({ timeoutMs: 2500 });
}

function hasRunningProcess() {
  return !!(blenderProcess && state.isRunning);
}

function setBlenderProcessStatus(status) {
  if (!status) return getStateSnapshot();
  if (!state.isRunning && status === 'embedded') {
    return getStateSnapshot();
  }
  updateState({ status });
  return getStateSnapshot();
}

function onBlenderProcessExit(callback) {
  if (typeof callback !== 'function') return () => {};
  processExitListeners.add(callback);
  return () => processExitListeners.delete(callback);
}

function initBlenderProcessManager(app) {
  appRef = app;
  configPath = path.join(appRef.getPath('userData'), 'blender-config.json');

  const config = readPersistedConfig();
  const initialPath = normalizeExecutablePath(config.executablePath || '');
  const recoveryReport = maybeCleanupStaleManagedProcess(config.lastManagedProcess);
  const recoveryNote = formatRecoveryNote(recoveryReport);
  if (recoveryReport && recoveryReport.status === 'killed') {
    console.log(`[blender-process] ${recoveryNote}`);
  } else if (recoveryReport && recoveryReport.status === 'kill_failed') {
    console.warn(`[blender-process] ${recoveryNote}`);
  }
  persistManagedProcess(null);
  updateState({
    executablePath: initialPath,
    status: getDefaultStatusForPath(initialPath),
    lastError: null,
    lastRecoveryNote: recoveryNote,
  });
  ensureWatchdog();
  return getStateSnapshot();
}

module.exports = {
  initBlenderProcessManager,
  getBlenderProcessState: getStateSnapshot,
  setBlenderExecutablePath: setExecutablePath,
  validateBlenderExecutablePath: validateExecutablePath,
  startBlenderProcess: startProcess,
  stopBlenderProcess: stopProcess,
  restartBlenderProcess: restartProcess,
  shutdownBlenderProcessManager: shutdownProcessManager,
  hasRunningProcess,
  setBlenderProcessStatus,
  onBlenderProcessExit,
};
