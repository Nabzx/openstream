const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");
const whisperServer = require("./whisperServer");
const rewriteModelServer = require("./rewriteModelServer");
const hotkeyHelper = require("./hotkeyHelper");
const accessibilityHelper = require("./accessibilityHelper");
const { createTranscriptionHttpAdapter } = require("./transcriptionHttpAdapter");
const { createBreakPlacementHttpAdapter } = require("./breakPlacementHttpAdapter");
const { runCompletedDictation } = require("./dictationCoordinator");
const { createPushToTalkCoordinator } = require("./pushToTalkCoordinator");

const isDev = process.env.NODE_ENV === "development";

const TRAY_ICON_FILES = {
  idle: "iconTemplate.png",
  recording: "icon-recording.png",
  transcribing: "icon-transcribing.png",
};

let tray = null;
let win = null;
let trayIcons = null;
let trayState = "idle";
let captureWin = null;
let overlayWin = null;
let hotkeyStarted = false;
const transcription = createTranscriptionHttpAdapter({ inferenceUrl: whisperServer.inferenceUrl });
const breakPlacement = createBreakPlacementHttpAdapter({
  chatCompletionsUrl: rewriteModelServer.chatCompletionsUrl,
});

function recordDictationDiagnostic(name, value) {
  console.log(`[dictation] ${name}: ${JSON.stringify(value)}`);
}

function createWindow() {
  if (win) {
    win.show();
    win.focus();
    return;
  }

  win = new BrowserWindow({
    width: 360,
    height: 220,
    show: false,
    resizable: false,
    fullscreenable: false,
    title: "OpenStream",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    win = null;
  });
}

function createCaptureWindow() {
  captureWin = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "capture", "capturePreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  captureWin.loadFile(path.join(__dirname, "capture", "captureWindow.html"));
}

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 180,
    height: 52,
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "overlay", "overlayPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWin.loadFile(path.join(__dirname, "overlay", "overlay.html"));
}

async function transcribeAndPrint(wavBuffer) {
  const result = await runCompletedDictation({
    wavBuffer,
    transcription,
    contextDetection: accessibilityHelper,
    breakPlacement,
    delivery: accessibilityHelper,
    setUserVisibleState,
    recordDiagnostic: recordDictationDiagnostic,
  });

  if (result.status === "delivered") {
    console.log(`[dictation] ${result.text}`);
    console.log("[dictation] inserted through accessibility");
  } else if (result.status === "held") {
    console.log(`[dictation] injection held: ${result.delivery.reason}`);
  } else if (result.status === "failed" && result.stage === "delivery") {
    console.error(`[dictation] injection error: ${result.delivery?.reason || result.error?.message || "unknown error"}`);
  } else if (result.status === "no-speech") {
    console.log("[dictation] (no speech detected)");
  } else if (result.status === "empty") {
    console.log("[dictation] no audio captured, skipping");
  }
}

const pushToTalkCoordinator = createPushToTalkCoordinator({
  startCapture() {
    if (!captureWin) return;
    captureWin.webContents.send("start-recording");
    console.log("[dictation] recording - release the hotkey to stop");
  },
  stopCapture() {
    if (!captureWin) return;
    captureWin.webContents.send("stop-recording");
  },
  setUserVisibleState,
});

function loadTrayIcons() {
  trayIcons = {};
  for (const [state, file] of Object.entries(TRAY_ICON_FILES)) {
    trayIcons[state] = nativeImage.createFromPath(path.join(__dirname, "icons", file));
  }
}

function setTrayState(state) {
  if (!trayIcons[state]) {
    throw new Error(`Unknown tray state: ${state}`);
  }
  trayState = state;
  tray.setImage(trayIcons[state]);
  tray.setToolTip(state === "idle" ? "OpenStream" : `OpenStream — ${state}`);
}

function setUserVisibleState(state) {
  setTrayState(state);
  if (!overlayWin || overlayWin.isDestroyed()) return;

  overlayWin.webContents.send("dictation-state", state);
  if (state === "recording") overlayWin.showInactive();
  else overlayWin.hide();
}

function createTray() {
  loadTrayIcons();
  tray = new Tray(trayIcons.idle);
  setTrayState("idle");

  const menuTemplate = [
    { label: "Open Window", click: createWindow },
    { type: "separator" },
  ];

  if (isDev) {
    menuTemplate.push(
      {
        label: "Debug: tray state",
        submenu: Object.keys(TRAY_ICON_FILES).map((state) => ({
          label: state,
          click: () => setTrayState(state),
        })),
      },
      { type: "separator" }
    );
  }

  menuTemplate.push({ label: "Quit OpenStream", click: () => app.quit() });
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
}

function isCaptureSender(event) {
  return captureWin && !captureWin.isDestroyed() && event.sender === captureWin.webContents;
}

ipcMain.on("capture-ready", (event) => {
  if (!isCaptureSender(event) || hotkeyStarted) return;
  hotkeyStarted = true;
  hotkeyHelper.start();
});

ipcMain.on("recording-complete", (event, arrayBuffer) => {
  if (!isCaptureSender(event)) return;
  transcribeAndPrint(Buffer.from(arrayBuffer));
});

ipcMain.on("sound-level", (event, level) => {
  if (!isCaptureSender(event) || !overlayWin || overlayWin.isDestroyed()) return;
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  overlayWin.webContents.send("sound-level", normalizedLevel);
});

ipcMain.on("recording-error", (event, message) => {
  if (!isCaptureSender(event)) return;
  console.error("[dictation] capture failed:", message);
  setUserVisibleState("idle");
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.hide();
  }
  createTray();
  hotkeyHelper.onKeyDown(pushToTalkCoordinator.keyDown);
  hotkeyHelper.onKeyUp(pushToTalkCoordinator.keyUp);
  createCaptureWindow();
  createOverlayWindow();
  whisperServer.start();
  rewriteModelServer.start();
  accessibilityHelper.start();
});

app.on("will-quit", () => {
  hotkeyHelper.stop();
  accessibilityHelper.stop();
  whisperServer.stop();
  rewriteModelServer.stop();
});

// Menu bar app: stay alive with no windows open, quit only from the tray menu.
app.on("window-all-closed", (event) => {
  event.preventDefault();
});
