const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("openstreamOverlay", {
  onStateChange(callback) {
    ipcRenderer.on("dictation-state", (_event, state) => callback(state));
  },
  onSoundLevel(callback) {
    ipcRenderer.on("sound-level", (_event, level) => callback(level));
  },
  onHeldResult(callback) {
    ipcRenderer.on("held-result", (_event, text) => callback(text));
  },
  onHeldResultCopied(callback) {
    ipcRenderer.on("held-result-copied", () => callback());
  },
  copyHeldResult() {
    ipcRenderer.send("copy-held-result");
  },
  dismissHeldResult() {
    ipcRenderer.send("dismiss-held-result");
  },
});
