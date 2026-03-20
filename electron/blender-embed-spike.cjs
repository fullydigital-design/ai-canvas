const path = require('path');
const { spawn } = require('child_process');
const { BrowserWindow } = require('electron');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function runWinParentScript({ mode, childPid, parentHwnd, width, height }) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'win-window-parent.ps1');
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
      '-Width',
      String(width),
      '-Height',
      String(height),
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

async function runBlenderEmbedSpike() {
  if (process.platform !== 'win32') {
    return {
      ok: false,
      reason: 'unsupported-platform',
      detail: 'Spike currently supports Windows only.',
    };
  }

  const hostWindow = new BrowserWindow({
    width: 1100,
    height: 740,
    title: 'AI Canvas - Embed Spike Host',
    show: false,
    backgroundColor: '#111319',
  });

  const result = {
    ok: false,
    mode: 'notepad-spike',
    steps: [],
  };

  let notepad = null;

  try {
    await hostWindow.loadURL(
      'data:text/html;charset=utf-8,' +
        encodeURIComponent(
          '<html><body style="margin:0;background:#111319;color:#98a2b3;font-family:Segoe UI,Arial,sans-serif;display:flex;align-items:center;justify-content:center;">Embed spike host window</body></html>',
        ),
    );
    hostWindow.show();
    result.steps.push('host-window-created');

    notepad = spawn('notepad.exe', [], { windowsHide: false });
    result.steps.push(`notepad-started:${notepad.pid}`);

    await delay(1400);

    const hostBounds = hostWindow.getContentBounds();
    const hostHwnd = getNativeHandleValue(hostWindow.getNativeWindowHandle());

    const attachInfo = await runWinParentScript({
      mode: 'attach',
      childPid: notepad.pid,
      parentHwnd: hostHwnd,
      width: Math.max(hostBounds.width, 800),
      height: Math.max(hostBounds.height, 500),
    });
    result.steps.push('attach-ok');
    result.attach = attachInfo;

    await delay(1800);

    const detachInfo = await runWinParentScript({
      mode: 'detach',
      childPid: notepad.pid,
      width: 1100,
      height: 740,
    });
    result.steps.push('detach-ok');
    result.detach = detachInfo;

    result.ok = true;
    return result;
  } catch (error) {
    return {
      ...result,
      ok: false,
      error: error && error.message ? error.message : String(error),
    };
  } finally {
    if (notepad && !notepad.killed) {
      notepad.kill('SIGTERM');
    }
    await delay(200);
    if (!hostWindow.isDestroyed()) {
      hostWindow.close();
    }
  }
}

module.exports = {
  runBlenderEmbedSpike,
};
