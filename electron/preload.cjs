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
  runBlenderEmbedSpike: () => ipcRenderer.invoke('run-blender-embed-spike'),
  blenderGetProcessState: () => ipcRenderer.invoke('blender-process-get-state'),
  blenderSetExecutablePath: (executablePath) => ipcRenderer.invoke('blender-process-set-path', executablePath),
  blenderValidateExecutablePath: (executablePath) => ipcRenderer.invoke('blender-process-validate-path', executablePath),
  blenderStartProcess: (options) => ipcRenderer.invoke('blender-process-start', options || {}),
  blenderStopProcess: () => ipcRenderer.invoke('blender-process-stop'),
  blenderRestartProcess: () => ipcRenderer.invoke('blender-process-restart'),
  blenderGetEmbedState: () => ipcRenderer.invoke('blender-embed-get-state'),
  blenderAttachEmbed: (bounds) => ipcRenderer.invoke('blender-embed-attach', bounds || {}),
  blenderSyncEmbedBounds: (bounds) => ipcRenderer.invoke('blender-embed-sync-bounds', bounds || {}),
  blenderFocusEmbed: () => ipcRenderer.invoke('blender-embed-focus'),
  blenderDetachEmbed: () => ipcRenderer.invoke('blender-embed-detach'),
  blenderBridgeGetState: () => ipcRenderer.invoke('blender-bridge-get-state'),
  blenderBridgeSetCameraSnapshot: (snapshot) => ipcRenderer.invoke('blender-bridge-set-camera-snapshot', snapshot || {}),
  blenderBridgeGetCameraState: () => ipcRenderer.invoke('blender-bridge-get-camera-state'),
  blenderBridgeGetSequences: () => ipcRenderer.invoke('blender-bridge-get-sequences'),
  blenderBridgeGetSequenceFrame: (args) => ipcRenderer.invoke('blender-bridge-get-sequence-frame', args || {}),
  onBlenderBridgeImport: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('blender-bridge-import', handler);
    return () => ipcRenderer.removeListener('blender-bridge-import', handler);
  },
  onBlenderBridgeCameraStates: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('blender-bridge-camera-states', handler);
    return () => ipcRenderer.removeListener('blender-bridge-camera-states', handler);
  },
  onBlenderBridgeSequence: (callback) => {
    const handler = (event, payload) => callback(payload);
    ipcRenderer.on('blender-bridge-sequence', handler);
    return () => ipcRenderer.removeListener('blender-bridge-sequence', handler);
  },
  isElectron: true,
});
