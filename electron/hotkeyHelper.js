const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const { resourcesRoot } = require("./paths");

const BIN_PATH = path.join(resourcesRoot(), "bin", "hotkey-helper");

// Keycode 2 is 'D' on the ANSI layout - matches settingsStore.js's
// DEFAULT_SETTINGS, so a fresh install with no settings file behaves
// exactly as it always has. The helper only knows keycodes, not accelerator
// strings, so the mapping lives here.
//
// Control+Option, not Cmd+Shift: this tap is listen-only (see main.swift),
// so the keystroke still reaches whatever app is focused. A Cmd-combo that
// doesn't match a menu item makes AppKit play the system alert beep, which
// then gets captured at the start of the recording and Whisper hallucinates
// as "[Music]". Control+Option isn't treated as a menu key-equivalent, so
// nothing beeps.
const DEFAULT_HOTKEY = { keyCode: 2, modifiers: ["ctrl", "alt"] };

const RESTART_DELAY_MS = 1000;

function argsForHotkey(hotkey) {
  return ["--keycode", String(hotkey.keyCode), "--modifiers", hotkey.modifiers.join(",")];
}

function createHotkeyHelper({
  spawnProcess = spawn,
  restartDelayMs = RESTART_DELAY_MS,
  setRestartTimer = setTimeout,
  clearRestartTimer = clearTimeout,
  stderr = process.stderr,
  hotkey = DEFAULT_HOTKEY,
} = {}) {
  let currentHotkey = hotkey;
  let child = null;
  let stopping = false;
  let restartTimer = null;
  let onDown = () => {};
  let onUp = () => {};

  function handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (!message || typeof message !== "object" || !Number.isFinite(message.ts)) return;
    if (message.event === "down") onDown();
    else if (message.event === "up") onUp();
  }

  function start() {
    if (child) return;
    stopping = false;
    const proc = spawnProcess(BIN_PATH, argsForHotkey(currentHotkey));
    child = proc;

    readline.createInterface({ input: proc.stdout }).on("line", handleLine);
    proc.stderr.on("data", (data) => stderr.write(`[hotkey-helper] ${data}`));

    proc.on("exit", (code) => {
      // setHotkey() replaces `child` with a new process before this old
      // one's exit event arrives - without this check, that old event
      // would null out the reference to the new child and schedule a
      // spurious second restart on top of it.
      if (child !== proc) return;
      child = null;
      if (stopping) return;
      stderr.write(`[hotkey-helper] exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms\n`);
      restartTimer = setRestartTimer(() => {
        restartTimer = null;
        start();
      }, restartDelayMs);
    });
  }

  function stop() {
    stopping = true;
    if (restartTimer) {
      clearRestartTimer(restartTimer);
      restartTimer = null;
    }
    if (child) {
      const runningChild = child;
      child = null;
      runningChild.kill();
    }
  }

  function setHotkey(newHotkey) {
    currentHotkey = newHotkey;
    if (child) {
      stop();
      start();
    }
  }

  return {
    start,
    stop,
    setHotkey,
    onKeyDown(callback) {
      onDown = callback;
    },
    onKeyUp(callback) {
      onUp = callback;
    },
  };
}

module.exports = {
  ...createHotkeyHelper(),
  createHotkeyHelper,
  DEFAULT_HOTKEY,
};
