const { contextBridge, ipcRenderer } = require("electron");

// Main asks the shell to switch pages (the App menu's "Settings…" item,
// the tray). Returns an unsubscribe so the renderer can clean up.
function onNavigate(callback) {
  const listener = (_event, page) => callback(page);
  ipcRenderer.on("navigate", listener);
  return () => ipcRenderer.removeListener("navigate", listener);
}

// Live dictation activity - "idle" | "recording" | "transcribing" - so the
// Home page can reflect what the app is doing. Returns an unsubscribe.
function onDictationState(callback) {
  const listener = (_event, state) => callback(state);
  ipcRenderer.on("dictation-state", listener);
  return () => ipcRenderer.removeListener("dictation-state", listener);
}

// #249: first-run model-download progress for the Setup screen.
function onSetupProgress(callback) {
  const listener = (_event, progress) => callback(progress);
  ipcRenderer.on("setup-progress", listener);
  return () => ipcRenderer.removeListener("setup-progress", listener);
}

// #254: main pushes this when a model server's health changes (a crash
// loop, or a recovery), so the System panel refreshes without waiting for
// its poll. Carries no payload - the renderer re-fetches getHealth().
function onHealthChanged(callback) {
  const listener = () => callback();
  ipcRenderer.on("health-changed", listener);
  return () => ipcRenderer.removeListener("health-changed", listener);
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
    checkPermissions: () => ipcRenderer.invoke("app:check-permissions"),
    openPrivacySettings: (key) => ipcRenderer.invoke("app:open-privacy-settings", key),
    getSetupProgress: () => ipcRenderer.invoke("app:get-setup-progress"),
    retryModelDownload: () => ipcRenderer.invoke("app:retry-model-download"),
    restartModel: (role) => ipcRenderer.invoke("app:restart-model", role),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    setShortcut: (shortcut) => ipcRenderer.invoke("settings:set-shortcut", shortcut),
    startShortcutCapture: () => ipcRenderer.invoke("settings:start-shortcut-capture"),
    stopShortcutCapture: () => ipcRenderer.invoke("settings:stop-shortcut-capture"),
    onShortcutCaptured: (callback) => {
      const listener = (_event, shortcut) => callback(shortcut);
      ipcRenderer.on("settings:shortcut-captured", listener);
      return () => ipcRenderer.removeListener("settings:shortcut-captured", listener);
    },
    setBreakSafeApps: (apps) => ipcRenderer.invoke("settings:set-break-safe-apps", apps),
    resetBreakSafeApps: () => ipcRenderer.invoke("settings:reset-break-safe-apps"),
    pickBreakSafeApp: () => ipcRenderer.invoke("settings:pick-break-safe-app"),
    setVocabularyProjectPath: (projectPath) => ipcRenderer.invoke("settings:set-vocabulary-path", projectPath),
    setTermCorrections: (entries) => ipcRenderer.invoke("settings:set-term-corrections", entries),
    setCopyTranscript: (enabled) => ipcRenderer.invoke("settings:set-copy-transcript", enabled),
    setIdleUnloadMinutes: (minutes) => ipcRenderer.invoke("settings:set-idle-unload-minutes", minutes),
    setPauseMediaWhileRecording: (enabled) => ipcRenderer.invoke("settings:set-pause-media", enabled),
    setSoundCues: (enabled) => ipcRenderer.invoke("settings:set-sound-cues", enabled),
    setOverlayPosition: (position) => ipcRenderer.invoke("settings:set-overlay-position", position),
    setInputLanguage: (language) => ipcRenderer.invoke("settings:set-input-language", language),
  },
  vocabulary: {
    rescan: () => ipcRenderer.invoke("vocabulary:rescan"),
    getStatus: () => ipcRenderer.invoke("vocabulary:get-status"),
    chooseFolder: () => ipcRenderer.invoke("vocabulary:choose-folder"),
  },
  onNavigate,
  onDictationState,
  onSetupProgress,
  onHealthChanged,
});
