const { spawn } = require("child_process");
const readline = require("readline");
const path = require("path");
const { resourcesRoot } = require("./paths");

// Transcription model server (#204): the native/transcription-helper Swift
// process running Parakeet TDT 0.6b v3 as CoreML on the Neural Engine, via
// FluidAudio. Resident for the app's life, one transcript per WAV. This is
// the only transcription path - the earlier whisper.cpp one was removed in
// #326.
//
// The wire protocol is newline-delimited JSON, matching accessibilityHelper.js:
// a {"event":"ready"} line once the model is loaded, then id-tagged
// request/reply pairs.

const { CRASH_LOOP_THRESHOLD } = require("./modelSupervisor");

const BIN_PATH = path.join(resourcesRoot(), "bin", "transcription-helper");
const RESTART_DELAY_MS = 1000;
// #254: matches modelSupervisor - this many fast failures in a row means
// the helper is crash-looping, not hitting a blip.
const FAILURE_WINDOW_MS = 12000;

// Parakeet on the ANE is well under a second on a short clip once warm, but
// the first call after launch pays a Metal/ANE warm-up and a long dictation
// is chunked, so the ceiling is generous. A dictation that genuinely takes
// this long is a failure worth surfacing, not worth waiting on.
const REQUEST_TIMEOUT_MS = 30000;

function createTranscriptionHelper({
  spawnProcess = spawn,
  restartDelayMs = RESTART_DELAY_MS,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  setRequestTimer = setTimeout,
  clearRequestTimer = clearTimeout,
  setRestartTimer = setTimeout,
  clearRestartTimer = clearTimeout,
  stderr = process.stderr,
  now = () => Date.now(),
  crashLoopThreshold = CRASH_LOOP_THRESHOLD,
  failureWindowMs = FAILURE_WINDOW_MS,
} = {}) {
  let child = null;
  let stopping = false;
  let restartTimer = null;
  let nextId = 1;
  const pending = new Map();

  // #254: crash-loop tracking, so the app can show the model as failed
  // rather than silently retrying forever.
  let consecutiveFailures = 0;
  let lastStartAt = 0;
  const statusListeners = new Set();

  function emitStatus(value) {
    for (const listener of statusListeners) {
      try {
        listener(value);
      } catch {
        // A listener must never break the helper.
      }
    }
  }

  function onStatusChange(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }

  function status() {
    if (consecutiveFailures >= crashLoopThreshold) return "failed";
    if (ready) return "running";
    return "starting";
  }

  let ready = false;
  let readyResolve;
  let readyPromise = new Promise((resolve) => {
    readyResolve = resolve;
  });

  function resetReadyGate() {
    ready = false;
    readyPromise = new Promise((resolve) => {
      readyResolve = resolve;
    });
  }

  function markReady() {
    ready = true;
    // A clean ready signal ends any crash loop.
    if (consecutiveFailures > 0) {
      consecutiveFailures = 0;
      emitStatus("running");
    }
    readyResolve();
  }

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
    if (!message || typeof message !== "object") return;

    if (message.event === "ready") {
      markReady();
      return;
    }
    if (message.event === "error") {
      // The model could not load. The supervisor will restart the process,
      // which retries the download/load; until then whenReady() stays
      // pending and the health probe reports "starting".
      stderr.write(
        `[transcription-helper] model load failed${message.message ? `: ${message.message}` : ""}\n`,
      );
      return;
    }
    if (typeof message.id !== "string") return;
    settle(message.id, message, null);
  }

  function start() {
    if (child) return;
    stopping = false;
    lastStartAt = now();
    const spawnedChild = spawnProcess(BIN_PATH);
    child = spawnedChild;

    readline.createInterface({ input: spawnedChild.stdout }).on("line", handleLine);
    spawnedChild.stderr.on("data", (data) => stderr.write(`[transcription-helper] ${data}`));

    spawnedChild.on("exit", (code) => {
      if (child !== spawnedChild) return;
      child = null;
      resetReadyGate();
      for (const id of Array.from(pending.keys())) {
        settle(id, null, new Error("transcription-helper exited before replying"));
      }
      if (stopping) return;
      consecutiveFailures = now() - lastStartAt < failureWindowMs ? consecutiveFailures + 1 : 1;
      stderr.write(
        `[transcription-helper] exited unexpectedly (code ${code}), restarting in ${restartDelayMs}ms\n`,
      );
      if (consecutiveFailures === crashLoopThreshold) emitStatus("failed");
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
      settle(id, null, new Error("transcription-helper stopped before replying"));
    }
    if (child) {
      const runningChild = child;
      child = null;
      runningChild.kill();
    }
    resetReadyGate();
  }

  function isReady() {
    return ready;
  }

  function whenReady() {
    return readyPromise;
  }

  function request(cmd, payload = {}) {
    return new Promise((resolve, reject) => {
      if (!child) {
        reject(new Error("transcription-helper is not running"));
        return;
      }
      const id = String(nextId++);
      const timer = setRequestTimer(() => {
        settle(id, null, new Error(`transcription-helper ${cmd} request timed out after ${requestTimeoutMs}ms`));
      }, requestTimeoutMs);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ id, cmd, ...payload })}\n`);
    });
  }

  // Matches the transcription adapter the dictation coordinator expects.
  // `prompt` is accepted and ignored: Parakeet has no initial-prompt
  // biasing the way whisper did, so #16's vocabulary prompt does not apply
  // to this engine (FluidAudio exposes a separate vocabulary-boosting API
  // that a later pass can wire in).
  async function transcribe(wavBuffer, _prompt) {
    const buffer = Buffer.isBuffer(wavBuffer) ? wavBuffer : Buffer.from(wavBuffer);
    const reply = await request("transcribe", { wav: buffer.toString("base64") });
    if (reply.status !== "ok" || typeof reply.text !== "string") {
      throw new Error(
        `transcription-helper transcription failed${reply.reason ? `: ${reply.reason}` : ""}`,
      );
    }
    return reply.text.trim();
  }

  // #254: a user-driven restart of a failed helper - clear the crash-loop
  // count so it isn't still "failed" the moment it comes back.
  function restart() {
    consecutiveFailures = 0;
    stop();
    start();
  }

  return { start, stop, restart, isReady, whenReady, status, onStatusChange, transcribe };
}

module.exports = {
  ...createTranscriptionHelper(),
  createTranscriptionHelper,
};
