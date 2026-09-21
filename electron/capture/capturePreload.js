const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the hidden mic-capture window. Never shown to the user - see
// issue #33: a menu bar app has no visible window, so getUserMedia needs a
// hidden renderer to live in.
contextBridge.exposeInMainWorld("capture", {
  onStart: (callback) => ipcRenderer.on("start-recording", callback),
  onStop: (callback) => ipcRenderer.on("stop-recording", (_event, timing) => callback(timing)),
  onCancel: (callback) => ipcRenderer.on("cancel-recording", callback),
  // #137: the configured input device id (or null for the system default) -
  // pushed once at startup and again on every settings change.
  onSetDevice: (callback) => ipcRenderer.on("set-device", (_event, deviceId) => callback(deviceId)),
  sendReady: () => ipcRenderer.send("capture-ready"),
  sendRecording: (wavBuffer, timing) => ipcRenderer.send("recording-complete", wavBuffer, timing),
  sendSoundLevel: (level) => ipcRenderer.send("sound-level", level),
  sendError: (message) => ipcRenderer.send("recording-error", message),
});
