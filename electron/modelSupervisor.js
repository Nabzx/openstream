const { spawn: defaultSpawn } = require("child_process");

const DEFAULT_RESTART_DELAY_MS = 1000;
// #254: a process that fails this many times in a row, each within
// FAILURE_WINDOW_MS of the last, is crash-looping rather than hitting a
// one-off blip. The supervisor keeps retrying (a local binary can recover),
// but reports "failed" so the app can say so instead of sitting silent.
const CRASH_LOOP_THRESHOLD = 3;
const FAILURE_WINDOW_MS = 12000;

function createModelSupervisor(options) {
  const {
    roleName,
    command,
    args = [],
    restartDelayMs = DEFAULT_RESTART_DELAY_MS,
    spawn = defaultSpawn,
    setRestartTimer = setTimeout,
    clearRestartTimer = clearTimeout,
    stdout = process.stdout,
    stderr = process.stderr,
    now = () => Date.now(),
    crashLoopThreshold = CRASH_LOOP_THRESHOLD,
    failureWindowMs = FAILURE_WINDOW_MS,
  } = options;

  if (!roleName) throw new Error("Model supervisor requires a roleName");
  if (!command) throw new Error(`${roleName} supervisor requires a command`);

  let child = null;
  let stopping = false;
  let restartTimer = null;
  let consecutiveFailures = 0;
  let lastStartAt = 0;
  const statusListeners = new Set();

  function prefixedWrite(stream, data) {
    stream.write(`[${roleName}] ${data}`);
  }

  function emitStatus(value) {
    for (const listener of statusListeners) {
      try {
        listener(value);
      } catch {
        // A listener must never break the supervisor.
      }
    }
  }

  // The current run has stayed up past the failure window, so a past crash
  // loop counts as recovered. Checked lazily (on status()) rather than on a
  // timer - a few seconds of stale "failed" after a recovery is harmless.
  function clearIfRecovered() {
    if (consecutiveFailures > 0 && child && now() - lastStartAt > failureWindowMs) {
      consecutiveFailures = 0;
      emitStatus("running");
    }
  }

  function status() {
    clearIfRecovered();
    if (consecutiveFailures >= crashLoopThreshold) return "failed";
    return child ? "running" : "starting";
  }

  function onStatusChange(listener) {
    statusListeners.add(listener);
    return () => statusListeners.delete(listener);
  }

  function restartAfterFailure(failedChild, message) {
    if (child !== failedChild) return;
    child = null;
    if (stopping) return;
    // A run that lasted longer than the window was healthy - this failure
    // starts a fresh count rather than adding to an old loop.
    consecutiveFailures = now() - lastStartAt < failureWindowMs ? consecutiveFailures + 1 : 1;
    stderr.write(`[${roleName}] ${message}, restarting in ${restartDelayMs}ms\n`);
    if (consecutiveFailures === crashLoopThreshold) emitStatus("failed");
    restartTimer = setRestartTimer(() => {
      restartTimer = null;
      start();
    }, restartDelayMs);
  }

  function start() {
    if (child) return;
    stopping = false;
    lastStartAt = now();
    const spawnedChild = spawn(command, args);
    child = spawnedChild;

    if (spawnedChild.stdout) spawnedChild.stdout.on("data", (data) => prefixedWrite(stdout, data));
    if (spawnedChild.stderr) spawnedChild.stderr.on("data", (data) => prefixedWrite(stderr, data));

    spawnedChild.on("error", (error) => {
      const detail = error.code ? `${error.code}: ${error.message}` : error.message;
      restartAfterFailure(spawnedChild, `failed to start (${detail})`);
    });
    spawnedChild.on("exit", (code, signal) => {
      const detail = signal ? `signal ${signal}` : `code ${code}`;
      restartAfterFailure(spawnedChild, `exited unexpectedly (${detail})`);
    });
  }

  function stop() {
    stopping = true;
    if (restartTimer) {
      clearRestartTimer(restartTimer);
      restartTimer = null;
    }
    if (child) {
      child.kill();
      child = null;
    }
  }

  // #254: a user asking to restart a failed server is saying "try again from
  // scratch" - clear the crash-loop count so it isn't reported as failed the
  // instant it comes back up.
  function restart() {
    consecutiveFailures = 0;
    stop();
    start();
  }

  return { start, stop, restart, status, onStatusChange, roleName };
}

module.exports = { createModelSupervisor, DEFAULT_RESTART_DELAY_MS, CRASH_LOOP_THRESHOLD };
