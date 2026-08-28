const { contextBridge, ipcRenderer } = require("electron");

// Main asks the shell to switch pages (the App menu's "Settings…" item,
// the tray). Returns an unsubscribe so the renderer can clean up.
function onNavigate(callback) {
  const listener = (_event, page) => callback(page);
  ipcRenderer.on("navigate", listener);
  return () => ipcRenderer.removeListener("navigate", listener);
}

// The renderer's only route to the main process, per contextIsolation - see
// the settings window's webPreferences in main.js. First surface: settings
// (#19). This will grow to cover the hotkey helper, the accessibility
// helper, and the transcription model server as those get their own UI.
contextBridge.exposeInMainWorld("openstream", {
  app: {
    getHealth: () => ipcRenderer.invoke("app:get-health"),
    getLoginItem: () => ipcRenderer.invoke("app:get-login-item"),
    setLoginItem: (enabled) => ipcRenderer.invoke("app:set-login-item", enabled),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setShortcut: (shortcut) => ipcRenderer.invoke("settings:set-shortcut", shortcut),
    setBreakSafeApps: (apps) => ipcRenderer.invoke("settings:set-break-safe-apps", apps),
    setVocabularyProjectPath: (projectPath) => ipcRenderer.invoke("settings:set-vocabulary-path", projectPath),
  },
  vocabulary: {
    rescan: () => ipcRenderer.invoke("vocabulary:rescan"),
    getStatus: () => ipcRenderer.invoke("vocabulary:get-status"),
    chooseFolder: () => ipcRenderer.invoke("vocabulary:choose-folder"),
  },
  onNavigate,
});
