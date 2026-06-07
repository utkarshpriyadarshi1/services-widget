const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getStats: () => ipcRenderer.invoke('get-stats'),
  getServices: () => ipcRenderer.invoke('get-services'),
  executeAction: (name, displayName, action, param) => 
    ipcRenderer.invoke('execute-action', { name, displayName, action, param }),
  checkAdmin: () => ipcRenderer.invoke('check-admin'),
  relaunchAsAdmin: () => ipcRenderer.send('relaunch-as-admin'),
  closeApp: () => ipcRenderer.send('close-app'),
  onVisibilityChange: (callback) => {
    ipcRenderer.on('window-visibility', (event, isVisible) => callback(isVisible));
  }
});
