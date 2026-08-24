const { spawn: defaultSpawn } = require("child_process");

const DEFAULT_RESTART_DELAY_MS = 1000;

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
  } = options;

  if (!roleName) throw new Error("Model supervisor requires a roleName");
  if (!command) throw new Error(`${roleName} supervisor requires a command`);

  let child = null;
  let stopping = false;
  let restartTimer = null;

  function prefixedWrite(stream, data) {
    stream.write(`[${roleName}] ${data}`);
  }

  function restartAfterFailure(failedChild, message) {
    if (child !== failedChild) return;
    child = null;
    if (stopping) return;
    stderr.write(`[${roleName}] ${message}, restarting in ${restartDelayMs}ms\n`);
    restartTimer = setRestartTimer(() => {
      restartTimer = null;
      start();
    }, restartDelayMs);
  }

  function start() {
    if (child) return;
    stopping = false;
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

  return { start, stop, roleName };
}

module.exports = { createModelSupervisor, DEFAULT_RESTART_DELAY_MS };
