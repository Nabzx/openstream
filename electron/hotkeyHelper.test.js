const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createHotkeyHelper, DEFAULT_HOTKEY } = require("./hotkeyHelper");
const { STANDALONE_OPTION_KEY_CODE } = require("./hotkeyDefinitions");

function fakeProcess() {
  const process = new EventEmitter();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = () => {};
  return process;
}

function captureStream(chunks) {
  return new Writable({
    write(chunk, encoding, callback) {
      chunks.push(String(chunk));
      callback();
    },
  });
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("hotkey helper NDJSON reports one key down and one key up", async () => {
  const child = fakeProcess();
  const helper = createHotkeyHelper({ spawnProcess: () => child });
  const events = [];
  helper.onKeyDown(() => events.push("down"));
  helper.onKeyUp(() => events.push("up"));

  helper.start();
  child.stdout.write('{"event":"ready","ts":1710000000}\n');
  child.stdout.write('{"event":"down","ts":1710000000.25}\n');
  child.stdout.write('{"event":"up","ts":1710000001.5}\n');

  await nextTurn();
  assert.deepEqual(events, ["down", "up"]);
  helper.stop();
});

test("hotkey helper waits for the native ready event before becoming ready", async () => {
  const child = fakeProcess();
  const helper = createHotkeyHelper({ spawnProcess: () => child });

  const ready = helper.start();
  assert.equal(helper.isReady(), false);
  child.stdout.write('{"event":"ready","ts":1710000000.25}\n');

  await ready;
  assert.equal(helper.isReady(), true);
  helper.stop();
});

test("a candidate helper rejects when spawning fails", async () => {
  const helper = createHotkeyHelper({
    restartOnFailure: false,
    spawnProcess: () => {
      throw new Error("binary missing");
    },
  });

  await assert.rejects(helper.start(), /failed to start: binary missing/);
});

test("a candidate helper rejects when it exits before reporting ready", async () => {
  const child = fakeProcess();
  const helper = createHotkeyHelper({ restartOnFailure: false, spawnProcess: () => child });

  const ready = helper.start();
  child.emit("exit", 1);

  await assert.rejects(ready, /exited before reporting ready/);
  assert.equal(helper.isRunning(), false);
});

test("a candidate helper rejects when readiness times out", async () => {
  const child = fakeProcess();
  const timers = [];
  const helper = createHotkeyHelper({
    restartOnFailure: false,
    spawnProcess: () => child,
    readyTimeoutMs: 250,
    setReadyTimer(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearReadyTimer() {},
  });

  const ready = helper.start();
  assert.equal(timers[0].delay, 250);
  timers[0].callback();

  await assert.rejects(ready, /did not report ready within 250ms/);
  assert.equal(helper.isRunning(), false);
});

test("hotkey helper ignores non-contract output", async () => {
  const child = fakeProcess();
  const helper = createHotkeyHelper({ spawnProcess: () => child });
  const events = [];
  helper.onKeyDown(() => events.push("down"));
  helper.onKeyUp(() => events.push("up"));

  helper.start();
  child.stdout.write('{"event":"ready"}\n');
  child.stdout.write("null\n");
  child.stdout.write('{"event":"down"}\n');
  child.stdout.write('{"event":"up","ts":"now"}\n');
  child.stdout.write("helper log text\n");

  await nextTurn();
  assert.deepEqual(events, []);
  helper.stop();
});

test("spawns with the configured hotkey's args, defaulting to DEFAULT_HOTKEY", () => {
  const spawned = [];
  const helper = createHotkeyHelper({
    spawnProcess: (bin, args) => {
      spawned.push({ bin, args });
      return fakeProcess();
    },
  });

  helper.start();

  assert.equal(spawned.length, 1);
  assert.deepEqual(DEFAULT_HOTKEY, { keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] });
  assert.deepEqual(spawned[0].args, ["--keycode", String(STANDALONE_OPTION_KEY_CODE), "--modifiers", ""]);
  helper.stop();
});

test("starts with a custom hotkey when one is passed to the factory", () => {
  const spawned = [];
  const helper = createHotkeyHelper({
    hotkey: { keyCode: 49, modifiers: ["cmd", "shift"] },
    spawnProcess: (bin, args) => {
      spawned.push(args);
      return fakeProcess();
    },
  });

  helper.start();

  assert.deepEqual(spawned[0], ["--keycode", "49", "--modifiers", "cmd,shift"]);
  helper.stop();
});

test("setHotkey restarts a running helper with the new args", () => {
  const spawned = [];
  const children = [];
  const helper = createHotkeyHelper({
    spawnProcess: (bin, args) => {
      spawned.push(args);
      const child = fakeProcess();
      children.push(child);
      return child;
    },
  });

  helper.start();
  assert.equal(spawned.length, 1);

  helper.setHotkey({ keyCode: 49, modifiers: ["cmd", "shift"] });

  assert.equal(spawned.length, 2);
  assert.deepEqual(spawned[1], ["--keycode", "49", "--modifiers", "cmd,shift"]);
  helper.stop();
});

test("setHotkey before start() just changes what the next start() uses", () => {
  const spawned = [];
  const helper = createHotkeyHelper({
    spawnProcess: (bin, args) => {
      spawned.push(args);
      return fakeProcess();
    },
  });

  helper.setHotkey({ keyCode: 49, modifiers: ["cmd"] });
  assert.equal(spawned.length, 0, "not running yet, so no restart should happen");

  helper.start();
  assert.deepEqual(spawned[0], ["--keycode", "49", "--modifiers", "cmd"]);
  helper.stop();
});

test("the superseded process's own exit event does not trigger a second restart", async () => {
  const spawned = [];
  const children = [];
  const helper = createHotkeyHelper({
    restartDelayMs: 1,
    spawnProcess: (bin, args) => {
      spawned.push(args);
      const child = fakeProcess();
      children.push(child);
      return child;
    },
  });

  helper.start();
  helper.setHotkey({ keyCode: 49, modifiers: ["cmd"] });
  assert.equal(spawned.length, 2);

  // The old process (children[0]) exits some time after setHotkey already
  // replaced it - this must not be treated as an unexpected crash of the
  // (still running) new process.
  children[0].emit("exit", 0);
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(spawned.length, 2, "a stale exit from the superseded process must not spawn a third helper");
  helper.stop();
});

test("hotkey helper keeps diagnostics on stderr and out of the event protocol", async () => {
  const child = fakeProcess();
  const stderrChunks = [];
  const events = [];
  const helper = createHotkeyHelper({
    spawnProcess: () => child,
    stderr: captureStream(stderrChunks),
  });
  helper.onKeyDown(() => events.push("down"));

  helper.start();
  child.stderr.write("Input Monitoring permission is missing\n");
  child.stdout.write('{"event":"ready","ts":1710000000}\n');
  child.stdout.write('{"event":"down","ts":1710000000.25}\n');

  await nextTurn();
  assert.deepEqual(events, ["down"]);
  assert.equal(stderrChunks.join(""), "[hotkey-helper] Input Monitoring permission is missing\n");
  helper.stop();
});

test("hotkey helper restarts after an unexpected exit and resumes its event protocol", async () => {
  const firstChild = fakeProcess();
  const secondChild = fakeProcess();
  const children = [firstChild, secondChild];
  const timers = [];
  const events = [];
  const helper = createHotkeyHelper({
    spawnProcess: () => children.shift(),
    restartDelayMs: 25,
    setRestartTimer(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    stderr: captureStream([]),
  });
  helper.onKeyUp(() => events.push("up"));

  helper.start();
  firstChild.stdout.write('{"event":"ready","ts":1710000000.25}\n');
  await nextTurn();
  firstChild.emit("exit", 1);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  timers[0].callback();
  secondChild.stdout.write('{"event":"ready","ts":1710000001.25}\n');
  secondChild.stdout.write('{"event":"up","ts":1710000001.5}\n');

  await nextTurn();
  assert.deepEqual(events, ["up"]);
  helper.stop();
});
