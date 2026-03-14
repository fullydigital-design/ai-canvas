/**
 * Electron Packaging Configuration & Main Process Template
 *
 * This file contains the configuration needed to package this app as a
 * standalone .exe using Electron + electron-builder.
 *
 * ─── SETUP INSTRUCTIONS ───────────────────────────────────────────────
 *
 * 1. Install Electron and builder:
 *    npm install --save-dev electron electron-builder concurrently wait-on
 *
 * 2. Create `electron/main.cjs` with the content from MAIN_PROCESS_CODE below
 *
 * 3. Create `electron/preload.cjs` with the content from PRELOAD_CODE below
 *
 * 4. Add these scripts to package.json:
 *    "main": "electron/main.cjs",
 *    "scripts": {
 *      "electron:dev": "concurrently \"npm start\" \"wait-on http://localhost:5173 && electron .\"",
 *      "electron:build": "npm run build && electron-builder"
 *    }
 *
 * 5. Add electron-builder config to package.json:
 *    (see BUILDER_CONFIG below)
 *
 * 6. To build the .exe:
 *    npm run electron:build
 *
 * ─── CONFIGURATION OBJECTS (exported for reference) ──────────────────
 */

// Electron main process code (electron/main.cjs)
export const MAIN_PROCESS_CODE = `
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Keep a global reference of the window object
let mainWindow = null;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'AI Canvas — Photo & Video Editor',
    icon: path.join(__dirname, '../public/icon.png'),
    frame: false,           // Frameless for custom titlebar (optional)
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#3ECF8E',
      height: 40,
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,     // Allow loading local files (canvas exports)
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
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

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

// ─── IPC Handlers for native file dialogs ──────────────────────────

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
    const buffer = typeof data === 'string'
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
    } else {
      const buffer = fs.readFileSync(filePath);
      const base64 = buffer.toString('base64');
      const mimeType = ext === '.png' ? 'image/png'
        : ext === '.gif' ? 'image/gif'
        : ext === '.webp' ? 'image/webp'
        : ext === '.bmp' ? 'image/bmp'
        : 'image/jpeg';
      return { success: true, type: 'image', data: \\\`data:\\\${mimeType};base64,\\\${base64}\\\`, path: filePath };
    }
  }
  return { success: false };
});

ipcMain.handle('get-app-info', () => ({
  version: app.getVersion(),
  name: app.getName(),
  platform: process.platform,
  isPackaged: app.isPackaged,
}));
`;

// Electron preload script (electron/preload.cjs)
export const PRELOAD_CODE = `
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  openFile: (options) => ipcRenderer.invoke('open-file', options || {}),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  isElectron: true,
});
`;

// electron-builder configuration (add to package.json)
export const BUILDER_CONFIG = {
  appId: "com.aicanvas.editor",
  productName: "AI Canvas",
  directories: {
    output: "electron-dist",
    buildResources: "public",
  },
  files: [
    "dist/**/*",
    "electron/**/*",
    "package.json",
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"],
      },
      {
        target: "portable",
        arch: ["x64"],
      },
    ],
    icon: "public/icon.ico",
    artifactName: "AICanvas-${version}-Setup.${ext}",
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "AI Canvas",
    installerIcon: "public/icon.ico",
    uninstallerIcon: "public/icon.ico",
  },
  mac: {
    target: ["dmg", "zip"],
    icon: "public/icon.icns",
    category: "public.app-category.graphics-design",
    artifactName: "AICanvas-${version}.${ext}",
  },
  linux: {
    target: ["AppImage", "deb"],
    icon: "public/icon.png",
    category: "Graphics",
    artifactName: "AICanvas-${version}.${ext}",
  },
  portable: {
    artifactName: "AICanvas-${version}-Portable.${ext}",
  },
  extraMetadata: {
    main: "electron/main.cjs",
  },
};

// TypeScript declaration for window.electronAPI (add to global.d.ts)
export const ELECTRON_TYPE_DECLARATION = `
declare global {
  interface Window {
    electronAPI?: {
      saveFile: (options: {
        data: string | ArrayBuffer;
        defaultName?: string;
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{ success: boolean; path?: string }>;
      openFile: (options?: {
        filters?: { name: string; extensions: string[] }[];
      }) => Promise<{
        success: boolean;
        type?: 'image' | 'project';
        data?: string;
        path?: string;
      }>;
      getAppInfo: () => Promise<{
        version: string;
        name: string;
        platform: string;
        isPackaged: boolean;
      }>;
      isElectron: boolean;
    };
  }
}
export {};
`;

/**
 * Helper: Detect if running inside Electron
 */
export function isElectron(): boolean {
  return !!(window as any).electronAPI?.isElectron;
}

/**
 * Helper: Save file via native dialog (Electron) or download (browser)
 */
export async function saveFileNative(
  data: string,
  defaultName: string,
  filters?: { name: string; extensions: string[] }[]
): Promise<boolean> {
  if (isElectron()) {
    const result = await (window as any).electronAPI.saveFile({
      data,
      defaultName,
      filters,
    });
    return result.success;
  }
  // Browser fallback: download link
  const a = document.createElement("a");
  a.href = data;
  a.download = defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}

/**
 * Helper: Open file via native dialog (Electron) or file input (browser)
 */
export async function openFileNative(
  filters?: { name: string; extensions: string[] }[]
): Promise<{ type: "image" | "project"; data: string } | null> {
  if (isElectron()) {
    const result = await (window as any).electronAPI.openFile({ filters });
    if (result.success) {
      return { type: result.type, data: result.data };
    }
    return null;
  }
  // Browser fallback: file input
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".png,.jpg,.jpeg,.webp,.gif,.bmp,.aicproj";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const data = reader.result as string;
        const type = file.name.endsWith(".aicproj") ? "project" : "image";
        resolve({ type, data });
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}
