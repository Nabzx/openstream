const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

const BIN_PATH = path.join(__dirname, "..", "resources", "bin", "hotkey-helper");

// Keycode 2 is 'D' on the ANSI layout - matches the CommandOrControl+Shift+D
// hotkey this replaces. The helper only knows keycodes, not accelerator
// strings, so the mapping lives here.
const ARGS = ["--keycode", "2", "--modifiers", "cmd,shift"];

const RESTART_DELAY_MS = 1000;

let child = null;
let stopping = false;
let onDown = () => {};
let onUp = () => {};

function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.event === "down") onDown();
  else if (msg.event === "up") onUp();
}

function start() {
  stopping = false;
  child = spawn(BIN_PATH, ARGS);

  readline.createInterface({ input: child.stdout }).on("line", handleLine);
  child.stderr.on("data", (data) => process.stderr.write(`[hotkey-helper] ${data}`));

  child.on("exit", (code) => {
    child = null;
    if (stopping) return;
    console.error(`[hotkey-helper] exited unexpectedly (code ${code}), restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

function stop() {
  stopping = true;
  if (child) child.kill();
}

module.exports = {
  start,
  stop,
  onKeyDown: (callback) => {
    onDown = callback;
  },
  onKeyUp: (callback) => {
    onUp = callback;
  },
};
