const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { runBlenderEmbedSpike } = require('./blender-embed-spike.cjs');
const {
  initBlenderProcessManager,
  getBlenderProcessState,
  setBlenderExecutablePath,
  validateBlenderExecutablePath,
  startBlenderProcess,
  stopBlenderProcess,
  restartBlenderProcess,
  shutdownBlenderProcessManager,
  hasRunningProcess,
  setBlenderProcessStatus,
  onBlenderProcessExit,
} = require('./blender-process-manager.cjs');
const {
  setEmbedMainWindow,
  getBlenderEmbedState,
  attachBlenderEmbed,
  syncBlenderEmbedBounds,
  focusBlenderEmbed,
  detachBlenderEmbed,
  resetEmbedStateForProcessExit,
} = require('./blender-embed-manager.cjs');
const {
  startBlenderBridgeServer,
  stopBlenderBridgeServer,
  getBlenderBridgeState,
  setPendingCameraSnapshot,
  getCameraBridgeState,
  getSequenceSummaries,
  getSequenceFrameData,
} = require('./blender-bridge-server.cjs');

// Keep a global reference of the window object
let mainWindow = null;
let isQuittingAfterBlenderCleanup = false;

const isDev = !app.isPackaged;

function sendMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action);
  }
}

async function installReactDevTools() {
  if (!isDev) return;

  try {
    const { default: installExtension, REACT_DEVELOPER_TOOLS } = require('electron-devtools-installer');
    await installExtension(REACT_DEVELOPER_TOOLS);
    console.log('[devtools] React Developer Tools installed');
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.warn('[devtools] React Developer Tools install failed:', message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AI Canvas - Photo & Video Editor',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
    backgroundColor: '#1a1a2e',
    show: false,
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    setEmbedMainWindow(null);
    mainWindow = null;
  });
  setEmbedMainWindow(mainWindow);
}

function createAppMenu() {
  const menuTemplate = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'Ctrl+N',
          click: () => sendMenuAction('new'),
        },
        {
          label: 'Open',
          accelerator: 'Ctrl+O',
          click: () => sendMenuAction('open'),
        },
        {
          label: 'Save',
          accelerator: 'Ctrl+S',
          click: () => sendMenuAction('save'),
        },
        {
          label: 'Export PNG',
          accelerator: 'Ctrl+Shift+E',
          click: () => sendMenuAction('export-png'),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'Ctrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'Ctrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'Ctrl+Shift+Z', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', role: 'cut' },
        { label: 'Copy', role: 'copy' },
        { label: 'Paste', role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle DevTools', accelerator: 'F12', role: 'toggleDevTools' },
        { label: 'Reload', accelerator: 'Ctrl+R', role: 'reload' },
        { type: 'separator' },
        { label: 'Zoom In', accelerator: 'Ctrl+=', role: 'zoomIn' },
        { label: 'Zoom Out', accelerator: 'Ctrl+-', role: 'zoomOut' },
        { label: 'Reset Zoom', accelerator: 'Ctrl+0', role: 'resetZoom' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Run Blender Embed Spike (Notepad)',
          click: async () => {
            const result = await runBlenderEmbedSpike();
            const detail = result.ok
              ? `Status: success\nSteps: ${(result.steps || []).join(', ')}`
              : `Status: failed\nReason: ${result.error || result.reason || 'Unknown error'}`;

            dialog.showMessageBox(mainWindow, {
              type: result.ok ? 'info' : 'warning',
              title: 'Blender Embed Spike',
              message: result.ok ? 'Attach/detach spike completed.' : 'Attach/detach spike failed.',
              detail,
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Debug Window',
          accelerator: 'Ctrl+Shift+I',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.openDevTools({ mode: 'detach' });
            }
          },
        },
        { type: 'separator' },
        {
          label: 'About',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About',
              message: app.getName(),
              detail: `Version ${app.getVersion()}`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(async () => {
  initBlenderProcessManager(app);
  onBlenderProcessExit((pid) => {
    resetEmbedStateForProcessExit(pid);
  });
  await installReactDevTools();
  createWindow();
  createAppMenu();
  const bridgeStart = await startBlenderBridgeServer({
    host: '127.0.0.1',
    port: 8765,
    onImport: (importMessage) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window is not available to receive imports.');
      }
      mainWindow.webContents.send('blender-bridge-import', importMessage);
      return true;
    },
    onCameraStates: (cameraPayload) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window is not available to receive camera states.');
      }
      mainWindow.webContents.send('blender-bridge-camera-states', cameraPayload);
      return true;
    },
    onSequence: (sequencePayload) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        throw new Error('Main window is not available to receive sequence imports.');
      }
      mainWindow.webContents.send('blender-bridge-sequence', sequencePayload);
      return true;
    },
  });
  if (!bridgeStart.ok) {
    console.warn('[blender-bridge] Failed to start:', bridgeStart.error || 'unknown error');
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (isQuittingAfterBlenderCleanup) return;
  if (!hasRunningProcess()) return;

  event.preventDefault();
  isQuittingAfterBlenderCleanup = true;
  Promise.allSettled([detachBlenderEmbed(), shutdownBlenderProcessManager(), stopBlenderBridgeServer()])
    .catch((error) => {
      console.warn('[blender-process] Shutdown cleanup failed:', error && error.message ? error.message : String(error));
    })
    .finally(() => {
      app.quit();
    });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for native file dialogs
ipcMain.handle('save-file', async (event, { data, defaultName, filters }) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName || 'export.png',
    filters: filters || [
      { name: 'PNG Image', extensions: ['png'] },
      { name: 'JPEG Image', extensions: ['jpg', 'jpeg'] },
      { name: 'AI Canvas Project', extensions: ['aicproj'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePath) {
    // data can be a base64 string or a Buffer
    const buffer =
      typeof data === 'string'
        ? Buffer.from(data.replace(/^data:[^;]+;base64,/, ''), 'base64')
        : data;
    fs.writeFileSync(result.filePath, buffer);
    return { success: true, path: result.filePath };
  }
  return { success: false };
});

ipcMain.handle('open-file', async (event, { filters }) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: filters || [
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] },
      { name: 'AI Canvas Project', extensions: ['aicproj'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.aicproj') {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { success: true, type: 'project', data: content, path: filePath };
    }

    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const mimeType =
      ext === '.png'
        ? 'image/png'
        : ext === '.gif'
          ? 'image/gif'
          : ext === '.webp'
            ? 'image/webp'
            : ext === '.bmp'
              ? 'image/bmp'
              : 'image/jpeg';
    return { success: true, type: 'image', data: `data:${mimeType};base64,${base64}`, path: filePath };
  }
  return { success: false };
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  isPackaged: app.isPackaged,
}));

ipcMain.on('set-title', (event, title) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(title);
  }
});

ipcMain.handle('run-blender-embed-spike', async () => runBlenderEmbedSpike());

ipcMain.handle('blender-process-get-state', async () => getBlenderProcessState());

ipcMain.handle('blender-process-set-path', async (event, executablePath) => {
  return setBlenderExecutablePath(executablePath);
});

ipcMain.handle('blender-process-validate-path', async (event, executablePath) => {
  return validateBlenderExecutablePath(executablePath);
});

ipcMain.handle('blender-process-start', async (event, options) => {
  return startBlenderProcess(options || {});
});

ipcMain.handle('blender-process-stop', async () => {
  await detachBlenderEmbed();
  return stopBlenderProcess();
});

ipcMain.handle('blender-process-restart', async () => {
  await detachBlenderEmbed();
  return restartBlenderProcess();
});

ipcMain.handle('blender-embed-get-state', async () => getBlenderEmbedState());

ipcMain.handle('blender-embed-attach', async (event, bounds) => {
  const processState = getBlenderProcessState();
  if (!processState.isRunning || !processState.pid) {
    return {
      ok: false,
      error: 'Blender process is not running. Start Blender first.',
      state: getBlenderEmbedState(),
    };
  }
  const attachResult = await attachBlenderEmbed(processState.pid, bounds || {});
  if (attachResult.ok) {
    setBlenderProcessStatus('embedded');
  }
  return attachResult;
});

ipcMain.handle('blender-embed-sync-bounds', async (event, bounds) => {
  return syncBlenderEmbedBounds(bounds || {});
});

ipcMain.handle('blender-embed-focus', async () => {
  return focusBlenderEmbed();
});

ipcMain.handle('blender-embed-detach', async () => {
  const detached = await detachBlenderEmbed();
  const processState = getBlenderProcessState();
  if (processState.isRunning) {
    setBlenderProcessStatus('detached');
  }
  return detached;
});

ipcMain.handle('blender-bridge-get-state', async () => getBlenderBridgeState());
ipcMain.handle('blender-bridge-set-camera-snapshot', async (event, snapshot) => setPendingCameraSnapshot(snapshot || {}));
ipcMain.handle('blender-bridge-get-camera-state', async () => getCameraBridgeState());
ipcMain.handle('blender-bridge-get-sequences', async () => ({ ok: true, sequences: getSequenceSummaries() }));
ipcMain.handle('blender-bridge-get-sequence-frame', async (event, args) => {
  try {
    const sequenceId = args && typeof args.sequenceId === 'string' ? args.sequenceId : '';
    const frameIndex = args && Number.isFinite(args.frameIndex) ? args.frameIndex : 0;
    const frame = await getSequenceFrameData(sequenceId, frameIndex);
    return { ok: true, frame };
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    return { ok: false, error: message };
  }
});
