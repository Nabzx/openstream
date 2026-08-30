const {
  app,
  Tray,
  Menu,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  screen,
  shell,
  systemPreferences,
} = require("electron");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { performance } = require("node:perf_hooks");
const { computeBottomCenteredPosition } = require("./overlayPosition");
const transcriptionHelper = require("./transcriptionHelper");
const rewriteModelServer = require("./rewriteModelServer");
const { ensureModels, modelsMissing } = require("./modelStore");
const hotkeyHelper = require("./hotkeyHelper");
const accessibilityHelper = require("./accessibilityHelper");
const { createSettingsStore } = require("./settingsStore");
const { setBreakSafeApplications, DEFAULT_BREAK_SAFE_BUNDLE_IDS } = require("./breakSafety");
const { createBundleIdReader } = require("./appBundleId");
const { createBreakPlacementHttpAdapter } = require("./breakPlacementHttpAdapter");
const { createDictationIntake } = require("./dictationCoordinator");
const { createVoiceEditIntake } = require("./voiceEditCoordinator");
const { createVocabularyCache } = require("./vocabularyCache");
const { createHeldResultController } = require("./heldResultController");
const { createPushToTalkCoordinator } = require("./pushToTalkCoordinator");
const { createPushToTalkShortcutController } = require("./pushToTalkShortcutController");
const { createFnShortcutCapture } = require("./shortcutCaptureController");
const { sanitizeWindowBounds, WINDOW_STATE_DEFAULTS } = require("./windowState");
const { evaluatePermissions, SETTINGS_URLS } = require("./permissions");

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

// An uncaught exception in the main process pops Electron's default error
// dialog - which, on window close or app teardown, reads to a user as "the
// app crashed" even when nothing important broke. Log the full stack to the
// terminal instead, and only re-raise the dialog for an error that isn't
// part of shutdown. See #294/#295 for the class of teardown race this
// catches; the log line is what a repro needs to pin the next one.
let quitting = false;
app.on("before-quit", () => {
  quitting = true;
});
// Launched from an editor's integrated terminal, closing that editor sends
// the app a signal rather than going through before-quit. Treat it as a
// quit so teardown races don't surface as a crash dialog.
for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(signal, () => {
    quitting = true;
    app.quit();
  });
}
process.on("uncaughtException", (error) => {
  const stack = error && error.stack ? error.stack : String(error);
  console.error(`[main] uncaught exception${quitting ? " during shutdown" : ""}:\n${stack}`);
  if (!quitting) {
    dialog.showErrorBox("OpenStream hit an unexpected error", stack);
  }
});
process.on("unhandledRejection", (reason) => {
  const stack = reason && reason.stack ? reason.stack : String(reason);
  console.error(`[main] unhandled promise rejection${quitting ? " during shutdown" : ""}:\n${stack}`);
});

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
// #249: the hotkey only arms once the capture window is up AND the model
// weights are in place (a packaged first run downloads them).
let captureReady = false;
let modelsReady = false;
let retryModelDownload = () => {};
let settingsStore = null;
let pushToTalkShortcut = null;
let shortcutCaptureSender = null;
// Chromium does not reliably deliver a standalone Fn keydown. A one-shot
// native helper listens for its flagsChanged transition only while Settings
// is waiting for a new shortcut.
const fnShortcutCapture = createFnShortcutCapture({
  onCaptured: (shortcut) => {
    const sender = shortcutCaptureSender;
    shortcutCaptureSender = null;
    if (!sender || sender.isDestroyed()) return;
    try {
      sender.send("settings:shortcut-captured", shortcut);
    } catch (error) {
      console.error(`[hotkey-helper] Fn shortcut capture could not notify settings: ${error.message}`);
    }
  },
  onDiagnostic: (message) => console.error(`[hotkey-helper] ${message}`),
});
// #204: the Swift transcription helper is itself the adapter - it exposes
// transcribe(wavBuffer, prompt) over its stdio protocol.
const transcription = transcriptionHelper;
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

// #17: voice editing shares the push-to-talk hotkey. If text is selected
// when the key goes down, the recording is an editing command rather than
// dictation, and goes here instead of dictationIntake.
const voiceEditIntake = createVoiceEditIntake({
  transcription,
  delivery: accessibilityHelper,
  onDiagnostic: (name, value) => console.log(`[voice-edit] ${name}: ${JSON.stringify(value)}`),
});

// A selection longer than this is almost never a deliberate edit target,
// and reading a huge AX value at key-down is exactly the case the
// injection engine's own max-chars guard exists to avoid.
const VOICE_EDIT_MAX_CHARS = 5000;

// Set at key-down (the async selection read), consumed at recording-complete.
let pendingSelectionRead = null;

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

  const display = screen.getPrimaryDisplay();
  const saved = settingsStore ? settingsStore.get().windowBounds : null;
  const bounds = sanitizeWindowBounds(saved, display.workArea);

  win = new BrowserWindow({
    ...bounds,
    minWidth: WINDOW_STATE_DEFAULTS.minWidth,
    minHeight: WINDOW_STATE_DEFAULTS.minHeight,
    show: false,
    // Traffic lights inset into a full-height content view - the shell
    // paints its own toolbar strip behind them (issue #211).
    titleBarStyle: "hiddenInset",
    title: "OpenStream",
    // #301: the blue-glass window sits on a native "under-window" vibrancy
    // material so the desktop shows through translucent panels. The window
    // background MUST be transparent or the opaque fill paints over the
    // material and the glass never shows. Reduce Transparency then flattens
    // the material; index.css's body wash keeps that fallback on-brand.
    vibrancy: "under-window",
    visualEffectState: "active",
    backgroundColor: "#00000000",
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

  // Remember size and position, debounced so a drag doesn't hammer the
  // settings file. Not saved while maximised/minimised - getBounds()
  // would record the wrong rectangle.
  const persistBounds = () => {
    if (!win || win.isDestroyed() || win.isMinimized() || win.isMaximized()) return;
    if (settingsStore) settingsStore.setWindowBounds(win.getBounds());
  };
  let boundsTimer = null;
  const scheduleBoundsPersist = () => {
    clearTimeout(boundsTimer);
    boundsTimer = setTimeout(persistBounds, 400);
  };
  win.on("resize", scheduleBoundsPersist);
  win.on("move", scheduleBoundsPersist);

  win.on("close", () => {
    clearTimeout(boundsTimer);
    persistBounds();
  });
  const windowContents = win.webContents;
  win.on("closed", () => {
    if (shortcutCaptureSender === windowContents) {
      shortcutCaptureSender = null;
      fnShortcutCapture.stop();
    }
    // Reading win.webContents here throws "Object has been destroyed" - the
    // window is already gone by "closed". createWindow() only ever has one
    // win at a time and nothing else reassigns it, so just clear it.
    win = null;
  });
}

// Opens the window and asks the renderer to show a particular page. The
// navigate message is sent once the page is loaded, and the shell also
// re-reads it on mount, so this works whether the window already existed
// or was just created.
function openWindowTo(page) {
  const wasOpen = Boolean(win);
  createWindow();
  if (!win) return;
  if (wasOpen && win.webContents) {
    win.webContents.send("navigate", page);
  } else {
    win.webContents.once("did-finish-load", () => win.webContents.send("navigate", page));
  }
}

// #249: model-download progress for the Setup screen. Latched so the
// window can re-read the last value when it (or the page) mounts mid-run.
let lastSetupProgress = null;
function sendSetupProgress(progress) {
  lastSetupProgress = progress;
  if (win && !win.isDestroyed()) {
    if (win.webContents.isLoading()) {
      win.webContents.once("did-finish-load", () => win.webContents.send("setup-progress", progress));
    } else {
      win.webContents.send("setup-progress", progress);
    }
  }
}

// The hotkey arms only once both the capture window is ready and the model
// weights are in place.
function maybeStartHotkey() {
  if (hotkeyStarted || !captureReady || !modelsReady || !pushToTalkShortcut) return;
  hotkeyStarted = true;
  void pushToTalkShortcut.start().catch((error) => {
    console.error("[hotkey-helper] active shortcut could not start:", error.message);
  });
}

// A regular Dock app has a menu bar (issue #209). It's also what makes
// Cmd-C / Cmd-V / Cmd-A work in the window's text fields - those only
// fire on macOS when the application menu carries the matching roles.
// App + Edit + Window, no File menu (there are no documents).
function createApplicationMenu() {
  app.setAboutPanelOptions({
    applicationName: "OpenStream",
    applicationVersion: app.getVersion(),
    // #288: "Beta release" sits on the copyright line, right under the
    // version - the version metadata itself is left untouched.
    copyright: "Beta release. Local-first voice dictation. MIT (app) / Apache-2.0 (models). No telemetry.",
  });

  const template = [
    {
      label: "OpenStream",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Settings…", accelerator: "CmdOrCtrl+,", click: () => openWindowTo("settings") },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
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
const OVERLAY_RESTING_SIZE = [244, 50];

function createOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: OVERLAY_RESTING_SIZE[0],
    height: OVERLAY_RESTING_SIZE[1],
    show: false,
    frame: false,
    transparent: true,
    // #300: the blue-glass overlay sits on a native macOS vibrancy
    // material. "hud" is the floating-panel material; visualEffectState
    // "active" keeps it bright even though the window is only ever shown
    // via showInactive(). Rounded corners + a native shadow so it reads as
    // a real glass panel; overlay.css matches the panel radius.
    vibrancy: "hud",
    visualEffectState: "active",
    roundedCorners: true,
    hasShadow: true,
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
  // Reapplied after the native window exists - on a frameless + transparent
  // window the constructor pairing has been unreliable on some
  // Electron/macOS combinations.
  overlayWin.setVibrancy("hud");
  overlayWin.loadFile(path.join(__dirname, "overlay", "overlay.html"));
}

function showHeldResult(text) {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.setFocusable(true);
  overlayWin.setIgnoreMouseEvents(false);
  overlayWin.setSize(432, 264, true);
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

// #17: fired on push-to-talk key-down. Kicks off the async selection read
// so recording-complete can tell a voice edit from a dictation - a slow or
// failed read just means "ordinary dictation" and must never delay
// recording, so this is deliberately not awaited here.
function beginPushToTalk() {
  pendingSelectionRead = accessibilityHelper.getSelection().catch(() => null);
  pushToTalkCoordinator.keyDown();
}

async function handleCompletedRecording(wavBuffer, timing) {
  const selectionRead = pendingSelectionRead;
  pendingSelectionRead = null;
  const selection = selectionRead ? await selectionRead : null;

  if (selection && selection.text.length > 0 && selection.text.length <= VOICE_EDIT_MAX_CHARS) {
    showVoiceEditWorking();
    return applyVoiceEdit(wavBuffer, selection, timing);
  }
  return transcribeAndPrint(wavBuffer, timing);
}

function showVoiceEditWorking() {
  setTrayState("transcribing");
  notifyWindowState("editing");
  if (!overlayWin || overlayWin.isDestroyed()) return;
  positionOverlayAtBottom();
  overlayWin.webContents.send("dictation-state", "editing");
  overlayWin.showInactive();
}

function showVoiceEditMessage(text) {
  setTrayState("idle");
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.webContents.send("voice-edit-message", text);
  overlayWin.showInactive();
  setTimeout(() => setUserVisibleState("idle"), 2000);
}

async function applyVoiceEdit(wavBuffer, selection, timing) {
  let result;
  try {
    result = await voiceEditIntake.complete(wavBuffer, {
      selection: selection.text,
      focusContext: selection.focusContext,
    });
  } catch (error) {
    console.error("[voice-edit] unexpected intake failure:", error);
    setUserVisibleState("idle");
    return;
  }

  if (result.status === "delivered") {
    console.log(`[voice-edit] ${result.commandId}: ${JSON.stringify(result.text)}`);
    if (Number.isFinite(timing?.releasedAtMs)) {
      console.log(`[voice-edit] release-to-insertion: ${(performance.now() - timing.releasedAtMs).toFixed(1)}ms`);
    }
    setUserVisibleState("idle");
  } else if (result.status === "held") {
    console.log(`[voice-edit] held: ${result.reason}`);
    setUserVisibleState("held", { text: result.text, reason: result.reason });
  } else if (result.status === "unrecognised") {
    console.log(`[voice-edit] command not recognised: ${JSON.stringify(result.command)}`);
    showVoiceEditMessage("Command not recognised");
  } else if (result.status === "declined") {
    console.log(`[voice-edit] ${result.commandId} declined: ${result.reason}`);
    showVoiceEditMessage(result.reason);
  } else if (result.status === "failed") {
    console.error(`[voice-edit] ${result.stage} failed: ${result.reason}`);
    setUserVisibleState("idle");
  } else {
    console.log("[voice-edit] no command captured, skipping");
    setUserVisibleState("idle");
  }
}

async function transcribeAndPrint(wavBuffer, timing) {
  let result;
  try {
    result = await dictationIntake.complete(wavBuffer);
  } catch (error) {
    console.error("[dictation] unexpected intake failure:", error);
    setUserVisibleState("idle");
    return;
  }

  // #227: one greppable line per dictation, so a single failed attempt on a
  // real Mac names the stage that failed without piecing the diagnostics
  // together by hand.
  const summary = [`[dictation] outcome: ${result.status}`];
  if (result.stage) summary.push(`stage=${result.stage}`);
  if (result.reason) summary.push(`reason=${JSON.stringify(result.reason)}`);
  console.log(summary.join(" "));

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

// #134: Escape aborts a recording in progress. Registered only while
// recording (a few seconds), so it isn't hijacking Escape from the app
// the user is dictating into the rest of the time - and during a
// dictation, an Escape press means "cancel this", not something in that
// app the user is deliberately not touching.
function armCancelShortcut() {
  const registered = globalShortcut.register("Escape", () => pushToTalkCoordinator.cancel());
  if (!registered) console.error("[dictation] couldn't register Escape to cancel - Escape won't abort a recording");
}
function disarmCancelShortcut() {
  globalShortcut.unregister("Escape");
}

const pushToTalkCoordinator = createPushToTalkCoordinator({
  startCapture() {
    if (!captureWin) return;
    captureWin.webContents.send("start-recording");
    armCancelShortcut();
    console.log("[dictation] recording - release the hotkey to stop, Escape to cancel");
  },
  stopCapture(timing) {
    disarmCancelShortcut();
    if (!captureWin) return;
    captureWin.webContents.send("stop-recording", timing);
  },
  cancelCapture() {
    disarmCancelShortcut();
    if (captureWin) captureWin.webContents.send("cancel-recording");
    console.log("[dictation] cancelled");
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

let permissionsBlocked = false;

function setTrayState(state) {
  if (!trayIcons[state]) {
    throw new Error(`Unknown tray state: ${state}`);
  }
  trayState = state;
  tray.setImage(trayIcons[state]);
  const base = state === "idle" ? "OpenStream" : `OpenStream — ${state}`;
  tray.setToolTip(permissionsBlocked ? `${base} (permissions needed)` : base);
}

// #47: reflected in the tray tooltip so a degraded app is visible without
// the window open. No separate warning icon yet.
function updateTrayForPermissions(verdict) {
  permissionsBlocked = !verdict.ok;
  if (tray) setTrayState(trayState);
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

// The desktop window's Home page reflects live dictation activity. It only
// needs the coarse state - recording / transcribing / idle - not the
// overlay's fuller vocabulary ("editing", "held").
function notifyWindowState(rawState) {
  if (!win || win.isDestroyed()) return;
  const state =
    rawState === "recording"
      ? "recording"
      : rawState === "transcribing" || rawState === "editing"
        ? "transcribing"
        : "idle";
  win.webContents.send("dictation-state", state);
}

function setUserVisibleState(state, details) {
  notifyWindowState(state);
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
  if (!isCaptureSender(event)) return;
  captureReady = true;
  maybeStartHotkey();
});

ipcMain.on("recording-complete", (event, arrayBuffer, timing) => {
  if (!isCaptureSender(event)) return;
  void handleCompletedRecording(Buffer.from(arrayBuffer), timing);
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

// Is an HTTP server answering on this URL at all? Any response - even a
// 404 - means the process is up and listening; a connection error or
// timeout means it's still loading its shaders (cold start is 15-20s -
// see docs/progress). Used only for the Home page's status section.
function probeHttp(url, timeoutMs = 800) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(timeoutMs, () => request.destroy());
    request.on("error", () => resolve(false));
  });
}

// Just the launch-at-login toggle. The broader startup behaviour (issue
// #135) - whether the window shows, notifications - is out of scope here.
ipcMain.handle("app:get-login-item", () => app.getLoginItemSettings().openAtLogin);
ipcMain.handle("app:set-login-item", (event, enabled) => {
  // openAsHidden: a login launch should start silently in the tray, not
  // throw the window up - it's a background dictation tool (#135).
  app.setLoginItemSettings({ openAtLogin: Boolean(enabled), openAsHidden: Boolean(enabled) });
  return app.getLoginItemSettings().openAtLogin;
});

// #47: the permission verdict. Accessibility + Input Monitoring come from
// the accessibility helper (which sees the grant as the Electron host that
// owns it does); Microphone from Electron. A helper that can't answer
// leaves those two "unknown", which `evaluatePermissions` treats as
// blocking - we can't confirm push-to-talk will work.
async function checkPermissions() {
  const fromHelper = await accessibilityHelper.getPermissions();
  return evaluatePermissions({
    accessibility: fromHelper ? fromHelper.accessibility : false,
    inputMonitoring: fromHelper ? fromHelper.inputMonitoring : "unknown",
    microphone: systemPreferences.getMediaAccessStatus("microphone"),
  });
}

ipcMain.handle("app:check-permissions", checkPermissions);

ipcMain.handle("app:open-privacy-settings", (event, key) => {
  const url = SETTINGS_URLS[key];
  if (url) shell.openExternal(url);
});

ipcMain.handle("app:get-health", async () => {
  const [transcription, rewrite, permissions] = await Promise.all([
    transcriptionHelper.isReady(),
    probeHttp(rewriteModelServer.healthUrl()),
    checkPermissions(),
  ]);
  return {
    permissions: permissions.grants,
    transcriptionModel: transcription ? "ready" : "starting",
    rewriteModel: rewrite ? "ready" : "starting",
  };
});

ipcMain.handle("settings:start-shortcut-capture", (event) => {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
  shortcutCaptureSender = event.sender;
  void fnShortcutCapture.start();
  return true;
});

ipcMain.handle("settings:stop-shortcut-capture", (event) => {
  if (shortcutCaptureSender !== event.sender) return false;
  shortcutCaptureSender = null;
  fnShortcutCapture.stop();
  return true;
});

ipcMain.handle("settings:set-shortcut", (event, shortcut) => {
  if (!pushToTalkShortcut) {
    return {
      ok: false,
      kind: "internal-failure",
      message: "Unable to change the Push-to-talk shortcut.",
    };
  }
  return pushToTalkShortcut.replace(shortcut);
});

ipcMain.handle("settings:set-break-safe-apps", (event, apps) => {
  // Same shape as settings:set-shortcut: setBreakSafeApps validates and
  // throws on anything malformed, so a bad renderer-side edit can't corrupt
  // the deny-by-default allow-list breakSafety.js enforces.
  const settings = settingsStore.setBreakSafeApps(apps);
  setBreakSafeApplications(settings.breakSafeApps);
  return settings;
});

ipcMain.handle("app:get-setup-progress", () => lastSetupProgress);
ipcMain.handle("app:retry-model-download", () => {
  retryModelDownload();
});

ipcMain.handle("settings:reset-break-safe-apps", () => {
  const settings = settingsStore.setBreakSafeApps([...DEFAULT_BREAK_SAFE_BUNDLE_IDS]);
  setBreakSafeApplications(settings.breakSafeApps);
  return settings;
});

// #19: pick an app from disk instead of hunting down its bundle id by
// hand. Returns { bundleId, name } for the renderer to add, or null if the
// dialog was cancelled; a bundle with no readable identifier rejects.
const bundleIdReader = createBundleIdReader();
ipcMain.handle("settings:pick-break-safe-app", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    defaultPath: "/Applications",
    properties: ["openFile"],
    filters: [{ name: "Applications", extensions: ["app"] }],
    message: "Choose an app where a spoken line break should insert a real newline",
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return bundleIdReader.readBundleId(result.filePaths[0]);
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
  // #135: a launch triggered by the login item never opens the Home
  // window, even on a first run - the user asked for it to start quietly.
  // A missing permission still surfaces (below) because that's actionable.
  const launchedAtLogin = process.platform === "darwin" && app.getLoginItemSettings().wasOpenedAtLogin;
  // Regular Dock app (issue #209) - no app.dock.hide().
  settingsStore = createSettingsStore({ filePath: settingsPath });
  createApplicationMenu();
  pushToTalkShortcut = createPushToTalkShortcutController({
    settingsStore,
    createHelper: hotkeyHelper.createHotkeyHelper,
    onKeyDown: beginPushToTalk,
    onKeyUp: pushToTalkCoordinator.keyUp,
    onDiagnostic: (message) => console.error(`[hotkey-helper] ${message}`),
  });
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
  createCaptureWindow();
  createOverlayWindow();
  accessibilityHelper.start();

  // #47: if a hard grant is missing, the app silently does nothing on every
  // push-to-talk - so open the window on the Permissions view and say so.
  const checkPermissionsAndSurface = () =>
    checkPermissions()
      .then((verdict) => {
        updateTrayForPermissions(verdict);
        if (!verdict.ok) openWindowTo("permissions");
        else if (isFirstLaunch && !launchedAtLogin) createWindow();
      })
      .catch((error) => {
        console.error("[permissions] startup check failed:", error);
        if (isFirstLaunch && !launchedAtLogin) createWindow();
      });

  // #135: the two model servers stay resident for the app's life (#29), so
  // they start here rather than per-dictation. At login, hold them back a
  // few seconds so the ~15-20s Metal warm-up isn't competing with
  // everything else macOS is starting.
  const startModelServers = () => {
    transcriptionHelper.start();
    rewriteModelServer.start();
  };

  // #249: a packaged app ships without the model weights and fetches them
  // on first run. Gate the servers - and the hotkey - on the weights being
  // in place, and show the download on a Setup screen.
  const bringUpModels = async () => {
    try {
      await ensureModels({ onProgress: sendSetupProgress });
      modelsReady = true;
      sendSetupProgress({ phase: "ready" });
      startModelServers();
      maybeStartHotkey();
    } catch (error) {
      console.error("[setup] model download failed:", error.message);
      sendSetupProgress({ phase: "error", message: error.message });
    }
  };
  retryModelDownload = bringUpModels;

  if (modelsMissing()) {
    createWindow();
    openWindowTo("setup");
    bringUpModels().then(checkPermissionsAndSurface);
  } else {
    if (launchedAtLogin) setTimeout(bringUpModels, 3000);
    else bringUpModels();
    checkPermissionsAndSurface();
  }
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  fnShortcutCapture.stop();
  shortcutCaptureSender = null;
  pushToTalkShortcut?.stop();
  accessibilityHelper.stop();
  transcriptionHelper.stop();
  rewriteModelServer.stop();
});

// Closing the desktop window backgrounds the app - the tray icon, the
// global hotkey and the resident model servers all stay alive. Quit is
// always explicit: Cmd-Q, the App menu, or the tray's "Quit OpenStream".
// See issue #209.
app.on("window-all-closed", (event) => {
  event.preventDefault();
});
