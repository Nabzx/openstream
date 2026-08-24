const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const { resourcesRoot } = require("./paths");

const BIN_PATH = path.join(resourcesRoot(), "bin", "hotkey-helper");

// Keycode 2 is 'D' on the ANSI layout - matches the CommandOrControl+Shift+D
// hotkey this replaces. The helper only knows keycodes, not accelerator
// strings, so the mapping lives here.
const ARGS = ["--keycode", "2", "--modifiers", "cmd,shift"];
const RESTART_DELAY_MS = 1000;

function createHotkeyHelper({
  spawnProcess = spawn,
  restartDelayMs = RESTART_DELAY_MS,
  setRestartTimer = setTimeout,
  clearRestartTimer = clearTimeout,
  stderr = process.stderr,
} = {}) {
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
    const spawnedChild = spawnProcess(BIN_PATH, ARGS);
    child = spawnedChild;

    readline.createInterface({ input: spawnedChild.stdout }).on("line", handleLine);
    spawnedChild.stderr.on("data", (data) => stderr.write(`[hotkey-helper] ${data}`));

    spawnedChild.on("exit", (code) => {
      if (child !== spawnedChild) return;
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

  return {
    start,
    stop,
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
};
