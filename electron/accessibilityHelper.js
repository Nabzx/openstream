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
  setRestartTimer = setTimeout,
  clearRestartTimer = clearTimeout,
  stderr = process.stderr,
} = {}) {
  let child = null;
  let stopping = false;
  let restartTimer = null;
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
    if (child) return;
    stopping = false;
    const spawnedChild = spawnProcess(BIN_PATH);
    child = spawnedChild;

    readline.createInterface({ input: spawnedChild.stdout }).on("line", handleLine);
    spawnedChild.stderr.on("data", (data) => stderr.write(`[accessibility-helper] ${data}`));

    spawnedChild.on("exit", (code) => {
      if (child !== spawnedChild) return;
      child = null;
      for (const id of Array.from(pending.keys())) {
        settle(id, null, new Error("accessibility-helper exited before replying"));
      }
      if (stopping) return;
      stderr.write(`[accessibility-helper] exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms\n`);
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
    for (const id of Array.from(pending.keys())) {
      settle(id, null, new Error("accessibility-helper stopped before replying"));
    }
    if (child) {
      const runningChild = child;
      child = null;
      runningChild.kill();
    }
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
      // #227: carry the helper's own AXIsProcessTrusted() through when it
      // sends one, so "no frontmost application (trusted=false)" points
      // straight at a lost Accessibility grant rather than a mystery.
      const trust = typeof reply.trusted === "boolean" ? ` (trusted=${reply.trusted})` : "";
      throw new Error(
        `accessibility-helper returned an invalid context reply${reply.reason ? `: ${reply.reason}` : ""}${trust}`,
      );
    }
    // #181: axReady is false when the focused element never became AX-ready
    // in time and isOneLineField is the safe default, not the real role.
    // The dictation still proceeds - deny-by-default on line breaks.
    return {
      bundleId: reply.bundleId,
      isOneLineField: reply.isOneLineField,
      axReady: reply.axReady !== false,
    };
  }

  // #47: the two grants the pipeline can't work without, as this process
  // (and therefore the Electron host that owns the grant) sees them.
  // Returns null if the helper can't answer - the caller treats that as
  // "can't confirm", which is itself a blocking state.
  async function getPermissions() {
    let reply;
    try {
      reply = await request("permissions");
    } catch {
      return null;
    }
    if (reply.status !== "ok" || typeof reply.accessibility !== "boolean") {
      return null;
    }
    return {
      accessibility: reply.accessibility,
      inputMonitoring: typeof reply.inputMonitoring === "string" ? reply.inputMonitoring : "unknown",
    };
  }

  // #17: the focused field's current selection, read at push-to-talk
  // key-down. Returns null for "nothing selected" or "couldn't read" - the
  // caller treats both the same way (fall through to ordinary dictation).
  async function getSelection() {
    let reply;
    try {
      reply = await request("selection");
    } catch {
      return null;
    }
    if (
      reply.status !== "ok" ||
      typeof reply.text !== "string" ||
      reply.text.length === 0 ||
      typeof reply.bundleId !== "string" ||
      typeof reply.isOneLineField !== "boolean"
    ) {
      return null;
    }
    return {
      text: reply.text,
      focusContext: { bundleId: reply.bundleId, isOneLineField: reply.isOneLineField },
    };
  }

  // #355: expectedBundleId is the app the caller resolved focus context
  // against - typically just now, so the helper's own abort check (which
  // watches for the app changing again, mid-typing) has a fresh baseline.
  // Optional so existing callers are unaffected.
  async function deliver(text, expectedBundleId) {
    const reply = await request("insert", { text, ...(expectedBundleId ? { expectedBundleId } : {}) });
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
    getSelection,
    getPermissions,
    deliver,
  };
}

module.exports = {
  ...createAccessibilityHelper(),
  createAccessibilityHelper,
};
