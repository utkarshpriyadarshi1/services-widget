const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  getServices: () => ipcRenderer.invoke('get-services'),
  executeAction: (name, displayName, action, param) => 
    ipcRenderer.invoke('execute-action', { name, displayName, action, param }),
  checkAdmin: () => ipcRenderer.invoke('check-admin'),
  relaunchAsAdmin: () => ipcRenderer.send('relaunch-as-admin'),
  closeApp: () => ipcRenderer.send('close-app'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  isAlwaysOnTop: () => ipcRenderer.invoke('is-always-on-top'),
  setAlwaysOnTop: (flag) => ipcRenderer.invoke('set-always-on-top', flag),
  openLogFile: () => ipcRenderer.invoke('open-log-file'),
  onVisibilityChange: (callback) => {
    ipcRenderer.on('window-visibility', (event, isVisible) => callback(isVisible));
  }
});
