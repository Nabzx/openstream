const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openstreamOverlay", {
  onStateChange(callback) {
    ipcRenderer.on("dictation-state", (_event, state) => callback(state));
  },
  onSoundLevel(callback) {
    ipcRenderer.on("sound-level", (_event, level) => callback(level));
  },
});
