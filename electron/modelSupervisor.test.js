const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createModelSupervisor } = require("./modelSupervisor");

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.emit("exit", null, "SIGTERM");
  };
  return child;
}

function captureStream(chunks) {
  return new Writable({
    write(chunk, encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
}

test("supervises a model process by role name and restarts unexpected exits", () => {
  const spawned = [];
  const stderrChunks = [];
  const timers = [];
  const supervisor = createModelSupervisor({
    roleName: "transcription model server",
    command: "/tmp/transcription-server",
    args: ["--host", "127.0.0.1"],
    restartDelayMs: 25,
    spawn: (command, args) => {
      const child = fakeChild();
      spawned.push({ command, args, child });
      return child;
    },
    setRestartTimer: (fn, delay) => {
      timers.push({ fn, delay });
      return { unref() {} };
    },
    stderr: captureStream(stderrChunks),
  });

  supervisor.start();
  spawned[0].child.emit("exit", 1, null);

  assert.equal(spawned.length, 1);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  assert.match(stderrChunks.join(""), /\[transcription model server\] exited unexpectedly \(code 1\)/);

  timers[0].fn();
  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned[1].args, ["--host", "127.0.0.1"]);
});

test("restarts when the model process cannot be spawned", () => {
  const spawned = [];
  const stderrChunks = [];
  const timers = [];
  const supervisor = createModelSupervisor({
    roleName: "transcription model server",
    command: "/missing/transcription-server",
    restartDelayMs: 25,
    spawn: () => {
      const child = fakeChild();
      spawned.push(child);
      return child;
    },
    setRestartTimer: (fn, delay) => {
      timers.push({ fn, delay });
      return { unref() {} };
    },
    stderr: captureStream(stderrChunks),
  });

  supervisor.start();
  spawned[0].emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  assert.match(stderrChunks.join(""), /\[transcription model server\] failed to start \(ENOENT: spawn ENOENT\)/);

  timers[0].fn();
  assert.equal(spawned.length, 2);
});

test("expected stop does not schedule a restart", () => {
  const spawned = [];
  const timers = [];
  const supervisor = createModelSupervisor({
    roleName: "transcription model server",
    command: "/tmp/transcription-server",
    spawn: () => {
      const child = fakeChild();
      spawned.push(child);
      return child;
    },
    setRestartTimer: (fn, delay) => timers.push({ fn, delay }),
  });

  supervisor.start();
  supervisor.stop();

  assert.equal(spawned[0].killed, true);
  assert.equal(timers.length, 0);
});

test("stop cancels a pending restart after an unexpected exit", () => {
  const spawned = [];
  const timer = { cancelled: false };
  const supervisor = createModelSupervisor({
    roleName: "transcription model server",
    command: "/tmp/transcription-server",
    spawn: () => {
      const child = fakeChild();
      spawned.push(child);
      return child;
    },
    setRestartTimer: () => timer,
    stderr: captureStream([]),
    clearRestartTimer: (handle) => {
      handle.cancelled = true;
    },
  });

  supervisor.start();
  spawned[0].emit("exit", 1, null);
  supervisor.stop();

  assert.equal(timer.cancelled, true);
});

function crashLoopSupervisor(overrides = {}) {
  const spawned = [];
  const statuses = [];
  const supervisor = createModelSupervisor({
    roleName: "rewrite model server",
    command: "/tmp/rewrite-server",
    spawn: () => {
      const child = fakeChild();
      spawned.push(child);
      return child;
    },
    setRestartTimer: (fn) => {
      fn();
      return {};
    },
    stderr: captureStream([]),
    now: () => 0,
    failureWindowMs: 1000,
    ...overrides,
  });
  supervisor.onStatusChange((s) => statuses.push(s));
  return { supervisor, spawned, statuses, latest: () => spawned[spawned.length - 1] };
}

test("#254: three fast failures in a row report the server as failed", () => {
  const { supervisor, latest, statuses } = crashLoopSupervisor();
  supervisor.start();
  assert.equal(supervisor.status(), "running");

  latest().emit("exit", 1, null);
  assert.equal(supervisor.status(), "running");
  latest().emit("exit", 1, null);
  assert.equal(supervisor.status(), "running");
  latest().emit("exit", 1, null);

  assert.equal(supervisor.status(), "failed");
  assert.deepEqual(statuses, ["failed"]);
});

test("#254: a run that outlasts the failure window resets the crash count", () => {
  let clock = 0;
  const { supervisor, latest } = crashLoopSupervisor({ now: () => clock });
  supervisor.start();
  latest().emit("exit", 1, null);
  latest().emit("exit", 1, null);
  // The next run stays up well past the window before it dies.
  clock = 5000;
  latest().emit("exit", 1, null);

  assert.equal(supervisor.status(), "running");
});

test("#254: restart() clears a failed server", () => {
  const { supervisor, latest } = crashLoopSupervisor();
  supervisor.start();
  latest().emit("exit", 1, null);
  latest().emit("exit", 1, null);
  latest().emit("exit", 1, null);
  assert.equal(supervisor.status(), "failed");

  supervisor.restart();
  assert.equal(supervisor.status(), "running");
});
