const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");

const BIN_PATH = path.join(__dirname, "..", "resources", "bin", "accessibility-helper");
const RESTART_DELAY_MS = 1000;

// Generous: the settle guard alone can hold a reply for up to 1200ms before
// even the first rung is attempted (see #6, #62), and rung 2's clipboard
// restore adds another ~300ms on top of whichever rung actually delivers.
const REQUEST_TIMEOUT_MS = 3000;

let child = null;
let stopping = false;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, timer }

function settle(id, msg, err) {
  const entry = pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  pending.delete(id);
  if (err) entry.reject(err);
  else entry.resolve(msg);
}

function handleLine(line) {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (msg.event === "ready" || msg.id == null) return;
  settle(msg.id, msg, null);
}

function start() {
  stopping = false;
  child = spawn(BIN_PATH);

  readline.createInterface({ input: child.stdout }).on("line", handleLine);
  child.stderr.on("data", (data) => process.stderr.write(`[accessibility-helper] ${data}`));

  child.on("exit", (code) => {
    child = null;
    for (const id of Array.from(pending.keys())) {
      settle(id, null, new Error("accessibility-helper exited before replying"));
    }
    if (stopping) return;
    console.error(`[accessibility-helper] exited unexpectedly (code ${code}), restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(start, RESTART_DELAY_MS);
  });
}

function stop() {
  stopping = true;
  if (child) child.kill();
}

// Tagged with an id and allowed to reply out of order, per #6's contract:
// this helper is allowed to block on AX calls, so a slow inject must never
// head-of-line-block whatever the main process sends after it.
function inject(text) {
  return new Promise((resolve, reject) => {
    if (!child) {
      reject(new Error("accessibility-helper is not running"));
      return;
    }
    const id = String(nextId++);
    const timer = setTimeout(() => {
      settle(id, null, new Error(`accessibility-helper did not reply to inject within ${REQUEST_TIMEOUT_MS}ms`));
    }, REQUEST_TIMEOUT_MS);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, cmd: "inject", text }) + "\n");
  });
}

module.exports = { start, stop, inject };
