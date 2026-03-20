const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEV_HOST = '127.0.0.1';
const DEV_PORT = 5173;
const DEV_URL = `http://${DEV_HOST}:${DEV_PORT}`;
const READY_MARKER = '<title>AI Canvas Editor</title>';
const STARTUP_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 350;

const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

let viteProcess = null;
let electronProcess = null;
let shuttingDown = false;

function buildChildEnv() {
  const childEnv = { ...process.env };
  // If this flag is present (even empty), Electron can boot in Node mode.
  delete childEnv.ELECTRON_RUN_AS_NODE;
  return childEnv;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function spawnPnpm(args, options) {
  if (process.platform === 'win32') {
    const command = `${pnpmCmd} ${args.join(' ')}`;
    return spawn('cmd.exe', ['/d', '/c', command], {
      ...options,
      shell: false,
    });
  }

  return spawn(pnpmCmd, args, {
    ...options,
    shell: false,
  });
}

function checkAppReady() {
  return new Promise((resolve) => {
    const request = http.get(
      DEV_URL,
      {
        timeout: 1500,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => {
          chunks.push(chunk);
          if (Buffer.concat(chunks).length > 128 * 1024) {
            response.destroy();
          }
        });
        response.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          resolve(response.statusCode === 200 && body.includes(READY_MARKER));
        });
      },
    );

    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
    request.on('error', () => resolve(false));
  });
}

async function waitForAiCanvasServer() {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (viteProcess && viteProcess.exitCode !== null) {
      throw new Error(`Vite exited before app became ready (code ${viteProcess.exitCode}).`);
    }

    // Ensure we only start Electron after this repo's dev app is live.
    if (await checkAppReady()) return;
    await delay(POLL_INTERVAL_MS);
  }
  throw new Error(`Timed out waiting for AI Canvas dev server at ${DEV_URL}.`);
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  const killProcess = (proc) => {
    if (!proc || proc.exitCode !== null) return;
    try {
      proc.kill('SIGTERM');
    } catch {
      // ignore kill failures on shutdown
    }
  };

  killProcess(electronProcess);
  killProcess(viteProcess);

  setTimeout(() => process.exit(exitCode), 50);
}

async function main() {
  console.log(`[dev-launch] Starting Vite on ${DEV_URL}...`);
  viteProcess = spawnPnpm(['dev'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: buildChildEnv(),
  });

  viteProcess.on('exit', (code) => {
    if (shuttingDown) return;
    if (electronProcess && electronProcess.exitCode === null) {
      console.error(`[dev-launch] Vite exited unexpectedly with code ${code}. Closing Electron.`);
      shutdown(typeof code === 'number' ? code : 1);
      return;
    }
    process.exit(typeof code === 'number' ? code : 1);
  });

  try {
    await waitForAiCanvasServer();
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.error(`[dev-launch] ${message}`);
    console.error('[dev-launch] If another app is using port 5173, close it and retry.');
    shutdown(1);
    return;
  }

  console.log('[dev-launch] AI Canvas dev server is ready. Launching Electron...');
  electronProcess = spawnPnpm(['exec', 'electron', '.'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: buildChildEnv(),
  });

  electronProcess.on('exit', (code) => {
    shutdown(typeof code === 'number' ? code : 0);
  });
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('uncaughtException', (error) => {
  console.error('[dev-launch] Uncaught exception:', error);
  shutdown(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[dev-launch] Unhandled rejection:', reason);
  shutdown(1);
});

main();
