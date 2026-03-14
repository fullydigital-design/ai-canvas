const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (options) => ipcRenderer.invoke('save-file', options),
  openFile: (options) => ipcRenderer.invoke('open-file', options || {}),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  onMenuAction: (callback) => {
    ipcRenderer.on('menu-action', (event, action) => callback(action));
  },
  removeMenuActionListeners: () => {
    ipcRenderer.removeAllListeners('menu-action');
  },
  setTitle: (title) => ipcRenderer.send('set-title', title),
  isElectron: true,
});
