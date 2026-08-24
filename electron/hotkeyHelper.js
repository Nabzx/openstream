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

function createHotkeyHelper({ spawnProcess = spawn, restartDelayMs = RESTART_DELAY_MS } = {}) {
  let child = null;
  let stopping = false;
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
    stopping = false;
    child = spawnProcess(BIN_PATH, ARGS);

    readline.createInterface({ input: child.stdout }).on("line", handleLine);
    child.stderr.on("data", (data) => process.stderr.write(`[hotkey-helper] ${data}`));

    child.on("exit", (code) => {
      child = null;
      if (stopping) return;
      console.error(`[hotkey-helper] exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms`);
      setTimeout(start, restartDelayMs);
    });
  }

  function stop() {
    stopping = true;
    if (child) child.kill();
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
