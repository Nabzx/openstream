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

  function start() {
    if (child) return;
    stopping = false;
    child = spawn(command, args);

    if (child.stdout) child.stdout.on("data", (data) => prefixedWrite(stdout, data));
    if (child.stderr) child.stderr.on("data", (data) => prefixedWrite(stderr, data));

    child.on("exit", (code, signal) => {
      child = null;
      if (stopping) return;
      const detail = signal ? `signal ${signal}` : `code ${code}`;
      stderr.write(`[${roleName}] exited unexpectedly (${detail}), restarting in ${restartDelayMs}ms\n`);
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
      child.kill();
      child = null;
    }
  }

  return { start, stop, roleName };
}

module.exports = { createModelSupervisor, DEFAULT_RESTART_DELAY_MS };
