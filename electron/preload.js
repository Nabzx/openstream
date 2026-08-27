const { contextBridge, ipcRenderer } = require("electron");

// The renderer's only route to the main process, per contextIsolation - see
// the settings window's webPreferences in main.js. First surface: settings
// (#19). This will grow to cover the hotkey helper, the accessibility
// helper, and the transcription model server as those get their own UI.
contextBridge.exposeInMainWorld("openstream", {
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setHotkey: (hotkey) => ipcRenderer.invoke("settings:set-hotkey", hotkey),
    setBreakSafeApps: (apps) => ipcRenderer.invoke("settings:set-break-safe-apps", apps),
    setVocabularyProjectPath: (projectPath) => ipcRenderer.invoke("settings:set-vocabulary-path", projectPath),
  },
  vocabulary: {
    rescan: () => ipcRenderer.invoke("vocabulary:rescan"),
    getStatus: () => ipcRenderer.invoke("vocabulary:get-status"),
    chooseFolder: () => ipcRenderer.invoke("vocabulary:choose-folder"),
  },
});
