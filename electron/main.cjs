const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

const isDev = !app.isPackaged;

function sendMenuAction(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('menu-action', action);
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
    mainWindow = null;
  });
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

app.whenReady().then(() => {
  createWindow();
  createAppMenu();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
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
