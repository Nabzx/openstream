const { app, Tray, Menu, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const whisperServer = require("./whisperServer");
const hotkeyHelper = require("./hotkeyHelper");
const { encodeWav } = require("./wav");

const isDev = process.env.NODE_ENV === "development";

let tray = null;
let win = null;
let captureWin = null;
let isRecording = false;

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

async function transcribeAndPrint(int16Samples) {
  const wavBuffer = encodeWav(int16Samples);
  const formData = new FormData();
  formData.append("file", new Blob([wavBuffer], { type: "audio/wav" }), "dictation.wav");
  formData.append("response_format", "json");

  try {
    const res = await fetch(whisperServer.inferenceUrl(), { method: "POST", body: formData });
    if (!res.ok) throw new Error(`whisper-server returned ${res.status}`);
    const body = await res.json();
    console.log(`[dictation] ${(body.text || "").trim() || "(no speech detected)"}`);
  } catch (err) {
    console.error("[dictation] transcription failed:", err);
  }
}

function startRecording() {
  if (!captureWin || isRecording) return;
  isRecording = true;
  captureWin.webContents.send("start-recording");
  console.log("[dictation] recording - release the hotkey to stop");
}

function stopRecording() {
  if (!captureWin || !isRecording) return;
  isRecording = false;
  captureWin.webContents.send("stop-recording");
}

function createTray() {
  const iconPath = path.join(__dirname, "icons", "iconTemplate.png");
  tray = new Tray(iconPath);
  tray.setToolTip("OpenStream");

  const menu = Menu.buildFromTemplate([
    { label: "Open Window", click: createWindow },
    { type: "separator" },
    { label: "Quit OpenStream", click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.on("recording-data", (event, arrayBuffer) => {
  const buffer = Buffer.from(arrayBuffer);
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
  if (samples.length === 0) {
    console.log("[dictation] no audio captured, skipping");
    return;
  }
  transcribeAndPrint(samples);
});

ipcMain.on("recording-error", (event, message) => {
  console.error("[dictation] capture failed:", message);
  isRecording = false;
});

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    app.dock.hide();
  }
  createTray();
  createCaptureWindow();
  whisperServer.start();
  hotkeyHelper.onKeyDown(startRecording);
  hotkeyHelper.onKeyUp(stopRecording);
  hotkeyHelper.start();
});

app.on("will-quit", () => {
  hotkeyHelper.stop();
  whisperServer.stop();
});

// Menu bar app: stay alive with no windows open, quit only from the tray menu.
app.on("window-all-closed", (event) => {
  event.preventDefault();
});
