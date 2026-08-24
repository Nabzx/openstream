const { app, Tray, Menu, BrowserWindow, ipcMain, nativeImage } = require("electron");
const path = require("path");
const whisperServer = require("./whisperServer");
const hotkeyHelper = require("./hotkeyHelper");
const accessibilityHelper = require("./accessibilityHelper");
const { createPushToTalkCoordinator } = require("./pushToTalkCoordinator");
const { encodeWav } = require("./wav");

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

async function transcribeAndPrint(int16Samples) {
  const wavBuffer = encodeWav(int16Samples);
  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "dictation.wav");
  formData.append("response_format", "json");

  try {
    const res = await fetch(whisperServer.inferenceUrl(), { method: "POST", body: formData });
    if (!res.ok) throw new Error(`whisper-server returned ${res.status}`);
    const body = await res.json();
    const text = (body.text || "").trim();
    console.log(`[dictation] ${text || "(no speech detected)"}`);
    if (text) await injectTranscript(text);
  } catch (err) {
    console.error("[dictation] transcription failed:", err);
  } finally {
    setUserVisibleState("idle");
  }
}

// #6's helper reports one of three shapes: delivered (with the rung and
// whether it could confirm the text landed), held (nothing was risked - see
// #62's hold-never-guess), or a protocol error. The recording-only overlay
// added by #95 cannot show held text yet, so log the reason rather than
// silently dropping the dictation.
async function injectTranscript(text) {
  try {
    const result = await accessibilityHelper.inject(text);
    if (result.status === "delivered") {
      console.log(`[dictation] injected via ${result.method}${result.verified ? "" : " (unverified)"}`);
    } else if (result.status === "held") {
      console.log(`[dictation] injection held: ${result.reason}`);
    } else {
      console.error(`[dictation] injection error: ${result.reason}`);
    }
  } catch (err) {
    console.error("[dictation] injection failed:", err);
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

ipcMain.on("recording-data", (event, arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  if (samples.length === 0) {
    console.log("[dictation] no audio captured, skipping");
    setUserVisibleState("idle");
    return;
  }
  transcribeAndPrint(samples);
});

ipcMain.on("recording-error", (event, message) => {
  console.error("[dictation] capture failed:", message);
  setUserVisibleState("idle");
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.hide();
  }
  createTray();
  createCaptureWindow();
  createOverlayWindow();
  whisperServer.start();
  accessibilityHelper.start();
  hotkeyHelper.onKeyDown(pushToTalkCoordinator.keyDown);
  hotkeyHelper.onKeyUp(pushToTalkCoordinator.keyUp);
  hotkeyHelper.start();
});

app.on("will-quit", () => {
  hotkeyHelper.stop();
  accessibilityHelper.stop();
  whisperServer.stop();
});

// Menu bar app: stay alive with no windows open, quit only from the tray menu.
app.on("window-all-closed", (event) => {
  event.preventDefault();
});
