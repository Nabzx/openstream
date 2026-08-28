const { app, Tray, Menu, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, screen } = require("electron");
const fs = require("fs");
const path = require("path");
const { performance } = require("node:perf_hooks");
const { computeBottomCenteredPosition } = require("./overlayPosition");
const whisperServer = require("./whisperServer");
const rewriteModelServer = require("./rewriteModelServer");
const hotkeyHelper = require("./hotkeyHelper");
const accessibilityHelper = require("./accessibilityHelper");
const { createSettingsStore } = require("./settingsStore");
const { setBreakSafeApplications } = require("./breakSafety");
const { createTranscriptionHttpAdapter } = require("./transcriptionHttpAdapter");
const { createBreakPlacementHttpAdapter } = require("./breakPlacementHttpAdapter");
const { createDictationIntake } = require("./dictationCoordinator");
const { createVocabularyCache } = require("./vocabularyCache");
const { createHeldResultController } = require("./heldResultController");
const { createPushToTalkCoordinator } = require("./pushToTalkCoordinator");

// Without this, nothing stops a second `npm start` (or a launch someone
// forgot was already running) from spawning a whole second app: its own
// tray icon, its own push-to-talk overlay stacked on top of the first
// one's, its own hotkey helper racing the first for the same global
// combo, its own model servers. Must be requested before any of that setup
// below ever runs.
if (!app.requestSingleInstanceLock()) {
  console.error("[startup] another OpenStream instance is already running - quitting this one");
  app.quit();
  process.exit(0);
}

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
let settingsStore = null;
const transcription = createTranscriptionHttpAdapter({ inferenceUrl: whisperServer.inferenceUrl });
const breakPlacement = createBreakPlacementHttpAdapter({
  chatCompletionsUrl: rewriteModelServer.chatCompletionsUrl,
});
const vocabulary = createVocabularyCache();

function recordDictationDiagnostic(name, value) {
  console.log(`[dictation] ${name}: ${JSON.stringify(value)}`);
}

const dictationIntake = createDictationIntake({
  transcription,
  contextDetection: accessibilityHelper,
  breakPlacement,
  delivery: accessibilityHelper,
  vocabulary,
  onDiagnostic: recordDictationDiagnostic,
});

// The desktop window is only ever opened from an explicit user action -
// the tray item, a Dock-icon click (the `activate` handler), a second
// launch attempt, or first run. NOTHING in the dictation pipeline
// (dictationCoordinator, transcribeAndPrint, any capture/hotkey callback)
// may call this, win.show(), win.focus() or app.focus(): raising or
// focusing the window mid-dictation would steal focus from the app the
// user is dictating into. See issue #208 and AGENTS.md.
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

// The resting size for the recording/idle waveform - named so
// hideHeldResult() below can't drift from createOverlayWindow's initial
// size the way it did once already (merge artifact: it briefly resized
// back to the pre-redesign 180x52 instead of this).
const OVERLAY_RESTING_SIZE = [220, 56];

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: OVERLAY_RESTING_SIZE[0],
    height: OVERLAY_RESTING_SIZE[1],
    show: false,
    frame: false,
    transparent: true,
    resizable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Real macOS frosted-glass blur, not a flat dark box - "hud" is the
    // vibrancy material Apple's own HUD-style floating panels use.
    // visualEffectState defaults to "follow-window", which renders the
    // dimmer inactive appearance for a window that's never focused (this
    // one is always shown via showInactive()) - forcing "active" keeps the
    // vibrancy at full strength regardless.
    vibrancy: "hud",
    visualEffectState: "active",
    webPreferences: {
      preload: path.join(__dirname, "overlay", "overlayPreload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  // Reapplied explicitly, not just passed to the constructor: on a
  // frameless + transparent window this pairing has been unreliable at
  // construction time on some Electron/macOS combinations, and calling
  // setVibrancy() again once the native window actually exists is the
  // documented workaround.
  overlayWin.setVibrancy("hud");
  overlayWin.loadFile(path.join(__dirname, "overlay", "overlay.html"));
}

function showHeldResult(text) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setFocusable(true);
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.setSize(420, 260, true);
  overlayWin.webContents.send("held-result", text);
  overlayWin.showInactive();
}

function hideHeldResult() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.hide();
  overlayWin.setIgnoreMouseEvents(true);
  overlayWin.setFocusable(false);
  overlayWin.setSize(...OVERLAY_RESTING_SIZE, false);
}

const heldResultController = createHeldResultController({
  showHeldResult,
  hideHeldResult,
  writeClipboard: (text) => clipboard.writeText(text),
});

async function transcribeAndPrint(wavBuffer, timing) {
  let result;
  try {
    result = await dictationIntake.complete(wavBuffer);
  } catch (error) {
    console.error("[dictation] unexpected intake failure:", error);
    setUserVisibleState("idle");
    return;
  }

  if (result.status === "delivered") {
    console.log(`[dictation] ${result.text}`);
    console.log("[dictation] inserted through accessibility");
    if (Number.isFinite(timing?.releasedAtMs)) {
      const latencyMs = performance.now() - timing.releasedAtMs;
      const budgetResult = latencyMs < 1000 ? "within" : "over";
      console.log(`[dictation] release-to-insertion: ${latencyMs.toFixed(1)}ms (${budgetResult} 1000ms budget)`);
    }
    setUserVisibleState("idle");
  } else if (result.status === "held") {
    console.log(`[dictation] injection held: ${result.reason}`);
    setUserVisibleState("held", { text: result.text, reason: result.reason });
  } else if (result.status === "failed") {
    console.error(`[dictation] ${result.stage} failed: ${result.reason}`);
    setUserVisibleState("idle");
  } else if (result.status === "no-speech") {
    console.log("[dictation] (no speech detected)");
    setUserVisibleState("idle");
  } else if (result.status === "empty") {
    console.log("[dictation] no audio captured, skipping");
    setUserVisibleState("idle");
  }
}

const pushToTalkCoordinator = createPushToTalkCoordinator({
  startCapture() {
    if (!captureWin) return;
    captureWin.webContents.send("start-recording");
    console.log("[dictation] recording - release the hotkey to stop");
  },
  stopCapture(timing) {
    if (!captureWin) return;
    captureWin.webContents.send("stop-recording", timing);
  },
  setUserVisibleState,
  onStuckRecording() {
    // See #140/pushToTalkCoordinator.js: this fires only when keyUp never
    // arrived for a whole recording. Previously that left `recording` stuck
    // true forever with no signal at all - every press after it silently
    // did nothing. Logging it is the diagnostic #140 needs to confirm
    // whether this is what's actually happening in the field.
    console.error("[dictation] keyUp never arrived - force-stopped after the safety timeout (see #140)");
  },
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

// Positioned fresh on every show, not once at creation, so it follows
// whichever display the user is actually on - #116, same spot macOS's own
// dictation HUD uses: bottom-center, clear of the Dock.
function positionOverlayAtBottom() {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const [width, height] = overlayWin.getSize();
  const { x, y } = computeBottomCenteredPosition(display.workArea, width, height);
  overlayWin.setPosition(x, y);
}

function setUserVisibleState(state, details) {
  if (state === "held") {
    setTrayState("idle");
    heldResultController.hold(details.text);
    return;
  }

  setTrayState(state);
  if (!overlayWin || overlayWin.isDestroyed()) return;

  if (state === "recording") {
    heldResultController.dismiss();
    positionOverlayAtBottom();
  }
  overlayWin.webContents.send("dictation-state", state);
  if (state === "recording") {
    overlayWin.showInactive();
  } else {
    overlayWin.hide();
  }
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

ipcMain.on("recording-complete", (event, arrayBuffer, timing) => {
  if (!isCaptureSender(event)) return;
  void transcribeAndPrint(Buffer.from(arrayBuffer), timing);
});

ipcMain.on("sound-level", (event, level) => {
  if (!isCaptureSender(event) || !overlayWin || overlayWin.isDestroyed()) return;
  const normalizedLevel = Number.isFinite(level) ? Math.max(0, Math.min(1, level)) : 0;
  overlayWin.webContents.send("sound-level", normalizedLevel);
});

function isOverlaySender(event) {
  return overlayWin && !overlayWin.isDestroyed() && event.sender === overlayWin.webContents;
}

ipcMain.on("copy-held-result", (event) => {
  if (!isOverlaySender(event) || !heldResultController.copy()) return;
  overlayWin.webContents.send("held-result-copied");
});

ipcMain.on("dismiss-held-result", (event) => {
  if (!isOverlaySender(event)) return;
  heldResultController.dismiss();
});

ipcMain.on("recording-error", (event, message) => {
  if (!isCaptureSender(event)) return;
  console.error("[dictation] capture failed:", message);
  setUserVisibleState("idle");
});

ipcMain.handle("settings:get", () => settingsStore.get());

ipcMain.handle("settings:set-hotkey", (event, hotkey) => {
  // setHotkey validates and throws on a malformed hotkey - ipcMain.handle
  // turns that into a rejected promise on the renderer side automatically,
  // and the previously-saved hotkey is left untouched (see
  // settingsStore.js), so a bad renderer-side capture can't leave the app
  // with no working hotkey.
  const settings = settingsStore.setHotkey(hotkey);
  hotkeyHelper.setHotkey(settings.hotkey);
  return settings;
});

ipcMain.handle("settings:set-break-safe-apps", (event, apps) => {
  // Same shape as settings:set-hotkey: setBreakSafeApps validates and
  // throws on anything malformed, so a bad renderer-side edit can't corrupt
  // the deny-by-default allow-list breakSafety.js enforces.
  const settings = settingsStore.setBreakSafeApps(apps);
  setBreakSafeApplications(settings.breakSafeApps);
  return settings;
});

// #16: setting the path persists it and triggers a rescan in the same
// round trip, so the settings window can show the resulting status (or
// error) without a second call. A failed scan (bad path, not a git repo)
// rejects the promise and leaves both the persisted path and the previous
// cache as they were - see vocabularyCache.js.
ipcMain.handle("settings:set-vocabulary-path", async (event, projectPath) => {
  const settings = settingsStore.setVocabularyProjectPath(projectPath);
  await vocabulary.rescan(settings.vocabularyProjectPath);
  return { settings, status: vocabulary.getStatus() };
});

ipcMain.handle("vocabulary:rescan", async () => {
  await vocabulary.rescan(settingsStore.get().vocabularyProjectPath);
  return vocabulary.getStatus();
});

ipcMain.handle("vocabulary:get-status", () => vocabulary.getStatus());

ipcMain.handle("vocabulary:choose-folder", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// A second launch attempt hits this instead of silently doing nothing (or
// worse, silently doing everything twice) - bring the settings window
// forward so there's visible proof this instance is the one that's running.
app.on("second-instance", () => {
  createWindow();
});

// Regular Dock app (issue #209): clicking the Dock icon with no window
// open re-creates it. Without this the icon would be inert after the
// user closes the window.
app.on("activate", () => {
  createWindow();
});

app.whenReady().then(() => {
  const settingsPath = path.join(app.getPath("userData"), "settings.json");
  // First ever launch (no settings file yet) opens the window so a new
  // user sees the app came up and what the shortcut is. Later launches
  // stay silent in the tray - it's a background tool, not something that
  // should throw a window up every login. See issue #209.
  const isFirstLaunch = !fs.existsSync(settingsPath);
  settingsStore = createSettingsStore({ filePath: settingsPath });
  hotkeyHelper.setHotkey(settingsStore.get().hotkey);
  setBreakSafeApplications(settingsStore.get().breakSafeApps);
  // Fire-and-forget: a scan failing here (bad/moved path since last run)
  // must not block startup. It just means vocabulary biasing stays off
  // until the user opens Settings and fixes or re-picks the path.
  const configuredProjectPath = settingsStore.get().vocabularyProjectPath;
  if (configuredProjectPath) {
    vocabulary.rescan(configuredProjectPath).catch((error) => {
      console.error("[vocabulary] initial scan failed:", error.message);
    });
  }
  createTray();
  hotkeyHelper.onKeyDown(pushToTalkCoordinator.keyDown);
  hotkeyHelper.onKeyUp(pushToTalkCoordinator.keyUp);
  createCaptureWindow();
  createOverlayWindow();
  whisperServer.start();
  rewriteModelServer.start();
  accessibilityHelper.start();

  if (isFirstLaunch) createWindow();
});

app.on("will-quit", () => {
  hotkeyHelper.stop();
  accessibilityHelper.stop();
  whisperServer.stop();
  rewriteModelServer.stop();
});

// Closing the desktop window backgrounds the app - the tray icon, the
// global hotkey and the resident model servers all stay alive. Quit is
// always explicit: Cmd-Q, the App menu, or the tray's "Quit OpenStream".
// See issue #209.
app.on("window-all-closed", (event) => {
  event.preventDefault();
});
