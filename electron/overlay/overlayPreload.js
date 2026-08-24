const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openstreamOverlay", {
  onStateChange(callback) {
    ipcRenderer.on("dictation-state", (_event, state) => callback(state));
  },
});
