const { contextBridge, ipcRenderer } = require("electron");

// Bridge for the hidden mic-capture window. Never shown to the user - see
// issue #33: a menu bar app has no visible window, so getUserMedia needs a
// hidden renderer to live in.
contextBridge.exposeInMainWorld("capture", {
  onStart: (callback) => ipcRenderer.on("start-recording", callback),
  onStop: (callback) => ipcRenderer.on("stop-recording", callback),
  sendReady: () => ipcRenderer.send("capture-ready"),
  sendRecording: (wavBuffer) => ipcRenderer.send("recording-complete", wavBuffer),
  sendSoundLevel: (level) => ipcRenderer.send("sound-level", level),
  sendError: (message) => ipcRenderer.send("recording-error", message),
});
