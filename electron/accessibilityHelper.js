const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const { resourcesRoot } = require("./paths");

const BIN_PATH = path.join(resourcesRoot(), "bin", "accessibility-helper");
const RESTART_DELAY_MS = 1000;

// The settle guard can consume 1200ms before an insertion starts, and the
// clipboard fallback needs another 300ms to restore the user's clipboard.
const REQUEST_TIMEOUT_MS = 3000;

function createAccessibilityHelper({
  spawnProcess = spawn,
  restartDelayMs = RESTART_DELAY_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  setRequestTimer = setTimeout,
  clearRequestTimer = clearTimeout,
} = {}) {
  let child = null;
  let stopping = false;
  let nextId = 1;
  const pending = new Map();

  function settle(id, message, error) {
    const entry = pending.get(id);
    if (!entry) return;
    clearRequestTimer(entry.timer);
    pending.delete(id);
    if (error) entry.reject(error);
    else entry.resolve(message);
  }

  function handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== "object" || message.event === "ready" || typeof message.id !== "string") {
      return;
    }
    settle(message.id, message, null);
  }

  function start() {
    stopping = false;
    child = spawnProcess(BIN_PATH);

    readline.createInterface({ input: child.stdout }).on("line", handleLine);
    child.stderr.on("data", (data) => process.stderr.write(`[accessibility-helper] ${data}`));

    child.on("exit", (code) => {
      child = null;
      for (const id of Array.from(pending.keys())) {
        settle(id, null, new Error("accessibility-helper exited before replying"));
      }
      if (stopping) return;
      console.error(`[accessibility-helper] exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms`);
      setTimeout(start, restartDelayMs);
    });
  }

  function stop() {
    stopping = true;
    for (const id of Array.from(pending.keys())) {
      settle(id, null, new Error("accessibility-helper stopped before replying"));
    }
    if (child) child.kill();
  }

  function request(cmd, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!child) {
        reject(new Error("accessibility-helper is not running"));
        return;
      }

      const id = String(nextId++);
      const timer = setRequestTimer(() => {
        settle(id, null, new Error(`accessibility-helper ${cmd} request timed out after ${requestTimeoutMs}ms`));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, cmd, ...payload })}\n`);
    });
  }

  async function getFocusContext() {
    const reply = await request("context");
    if (
      reply.status !== "ok" ||
      typeof reply.bundleId !== "string" ||
      reply.bundleId.length === 0 ||
      typeof reply.isOneLineField !== "boolean"
    ) {
      throw new Error(`accessibility-helper returned an invalid context reply${reply.reason ? `: ${reply.reason}` : ""}`);
    }
    return { bundleId: reply.bundleId, isOneLineField: reply.isOneLineField };
  }

  async function deliver(text) {
    const reply = await request("insert", { text });
    if (reply.status === "delivered") return { kind: "inserted" };
    if (reply.status === "held" && typeof reply.reason === "string") {
      return { kind: "held", reason: reply.reason };
    }
    throw new Error(`accessibility-helper insertion failed${reply.reason ? `: ${reply.reason}` : ""}`);
  }

  return {
    start,
    stop,
    getFocusContext,
    deliver,
  };
}

module.exports = {
  ...createAccessibilityHelper(),
  createAccessibilityHelper,
};
