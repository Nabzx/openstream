const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createHotkeyHelper } = require("./hotkeyHelper");

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
  child.stdout.write('{"event":"down","ts":1710000000.25}\n');
  child.stdout.write('{"event":"up","ts":1710000001.5}\n');

  await nextTurn();
  assert.deepEqual(events, ["down", "up"]);
  helper.stop();
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
  firstChild.emit("exit", 1);

  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  timers[0].callback();
  secondChild.stdout.write('{"event":"up","ts":1710000001.5}\n');

  await nextTurn();
  assert.deepEqual(events, ["up"]);
  helper.stop();
});
