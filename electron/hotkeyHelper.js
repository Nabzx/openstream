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
const READY_TIMEOUT_MS = 5000;

function argsForHotkey(hotkey) {
  return ["--keycode", String(hotkey.keyCode), "--modifiers", hotkey.modifiers.join(",")];
}

function unavailableError(message) {
  return new Error(message);
}

function createHotkeyHelper({
  spawnProcess = spawn,
  restartDelayMs = RESTART_DELAY_MS,
  readyTimeoutMs = READY_TIMEOUT_MS,
  setRestartTimer = setTimeout,
  clearRestartTimer = clearTimeout,
  setReadyTimer = setTimeout,
  clearReadyTimer = clearTimeout,
  stderr = process.stderr,
  hotkey = DEFAULT_HOTKEY,
  restartOnFailure = true,
} = {}) {
  let currentHotkey = hotkey;
  let child = null;
  let ready = false;
  let stopping = false;
  let restartTimer = null;
  let readiness = null;
  let onDown = () => {};
  let onUp = () => {};

  function clearReadyTimerIfSet() {
    if (readiness?.timer == null) return;
    clearReadyTimer(readiness.timer);
    readiness.timer = null;
  }

  function makeReadiness() {
    let resolvePromise;
    let rejectPromise;
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // A normal active helper restarts in the background. Suppress an
    // unhandled rejection when callers only need that background behavior.
    promise.catch(() => {});
    return {
      promise,
      resolve: resolvePromise,
      reject: rejectPromise,
      settled: false,
      timer: null,
    };
  }

  function settleReadiness(error) {
    if (!readiness || readiness.settled) return;
    readiness.settled = true;
    if (error) readiness.reject(error);
    else readiness.resolve();
  }

  function scheduleRestart() {
    if (stopping || restartTimer !== null) return;
    restartTimer = setRestartTimer(() => {
      restartTimer = null;
      void start();
    }, restartDelayMs);
  }

  function handleProcessFailure(proc, error, { diagnostic, killProcess = false } = {}) {
    if (child !== proc) return;

    child = null;
    ready = false;
    clearReadyTimerIfSet();
    settleReadiness(error);
    readiness = null;

    if (diagnostic) stderr.write(`[hotkey-helper] ${diagnostic}\n`);
    if (killProcess) {
      try {
        proc.kill();
      } catch (killError) {
        stderr.write(`[hotkey-helper] could not stop failed helper: ${killError.message}\n`);
      }
    }
    if (!stopping && restartOnFailure) scheduleRestart();
  }

  function markReady(proc) {
    if (child !== proc || ready) return;
    ready = true;
    clearReadyTimerIfSet();
    settleReadiness();
  }

  function attachProcess(proc) {
    readline.createInterface({ input: proc.stdout }).on("line", (line) => handleLine(proc, line));
    proc.stderr.on("data", (data) => stderr.write(`[hotkey-helper] ${data}`));
    proc.on("error", (error) => {
      handleProcessFailure(proc, unavailableError(`hotkey-helper failed to start: ${error.message}`), {
        diagnostic: `failed: ${error.message}`,
        killProcess: true,
      });
    });
    proc.on("exit", (code) => {
      if (child !== proc) return;
      const error = ready ? null : unavailableError(`hotkey-helper exited before reporting ready (code ${code})`);
      const diagnostic = ready
        ? `exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms`
        : `exited before reporting ready (code ${code})`;
      handleProcessFailure(proc, error, { diagnostic });
    });
  }

  function armReadinessTimeout(proc, currentReadiness) {
    currentReadiness.timer = setReadyTimer(() => {
      if (child !== proc || ready) return;
      handleProcessFailure(
        proc,
        unavailableError(`hotkey-helper did not report ready within ${readyTimeoutMs}ms`),
        {
          diagnostic: `did not report ready within ${readyTimeoutMs}ms`,
          killProcess: true,
        },
      );
    }, readyTimeoutMs);
  }

  function handleLine(proc, line) {
    if (child !== proc) return;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (!message || typeof message !== "object" || !Number.isFinite(message.ts)) return;
    if (message.event === "ready") {
      markReady(proc);
    } else if (!ready) {
      return;
    } else if (message.event === "down") {
      onDown();
    } else if (message.event === "up") {
      onUp();
    }
  }

  function start() {
    if (child) return readiness?.promise ?? Promise.resolve();

    stopping = false;
    ready = false;
    readiness = makeReadiness();
    const currentReadiness = readiness;
    let proc;

    try {
      proc = spawnProcess(BIN_PATH, argsForHotkey(currentHotkey));
      child = proc;
      attachProcess(proc);
      armReadinessTimeout(proc, currentReadiness);
    } catch (error) {
      const failure = unavailableError(`hotkey-helper failed to start: ${error.message}`);
      if (child === proc) {
        handleProcessFailure(proc, failure, { diagnostic: failure.message, killProcess: true });
      } else {
        currentReadiness.settled = true;
        currentReadiness.reject(failure);
        readiness = null;
        if (!stopping && restartOnFailure) scheduleRestart();
      }
    }

    return currentReadiness.promise;
  }

  function stop() {
    stopping = true;
    if (restartTimer !== null) {
      clearRestartTimer(restartTimer);
      restartTimer = null;
    }
    if (!child) return;

    const runningChild = child;
    child = null;
    ready = false;
    clearReadyTimerIfSet();
    settleReadiness(unavailableError("hotkey-helper stopped before reporting ready"));
    readiness = null;
    runningChild.kill();
  }

  function enableAutomaticRestart() {
    // A candidate does not restart while it is being checked. Once promoted,
    // it takes the same crash-restart path as the original active helper.
    restartOnFailure = true;
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
    enableAutomaticRestart,
    setHotkey,
    isReady: () => ready,
    isRunning: () => child !== null,
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
  READY_TIMEOUT_MS,
};
