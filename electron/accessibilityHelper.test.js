const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");
const { createAccessibilityHelper } = require("./accessibilityHelper");
const { createHotkeyHelper } = require("./hotkeyHelper");

function fakeProcess() {
  const process = new EventEmitter();
  process.stdin = new PassThrough();
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

function readRequests(child) {
  const requests = [];
  child.stdin.on("data", (data) => {
    for (const line of data.toString().trim().split("\n")) {
      if (line) requests.push(JSON.parse(line));
    }
  });
  return requests;
}

function nextTurn() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("accessibility helper correlates context and insertion replies received out of order", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const helper = createAccessibilityHelper({ spawnProcess: () => child });
  helper.start();

  const contextPromise = helper.getFocusContext();
  const insertionPromise = helper.deliver("First line.\n\nSecond line.");
  await nextTurn();

  assert.deepEqual(requests, [
    { id: "1", cmd: "context" },
    { id: "2", cmd: "insert", text: "First line.\n\nSecond line." },
  ]);

  child.stdout.write('{"id":"2","status":"delivered","method":"wrote into the field","verified":true}\n');
  child.stdout.write('{"id":"1","status":"ok","bundleId":"com.apple.TextEdit","isOneLineField":false}\n');

  assert.deepEqual(await contextPromise, { bundleId: "com.apple.TextEdit", isOneLineField: false });
  assert.deepEqual(await insertionPromise, { kind: "inserted" });
  helper.stop();
});

test("accessibility helper returns a held insertion without retrying it", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const helper = createAccessibilityHelper({ spawnProcess: () => child });
  helper.start();

  const resultPromise = helper.deliver("Complete finished text.");
  await nextTurn();
  child.stdout.write(`{"id":"${requests[0].id}","status":"held","reason":"target changed"}\n`);

  assert.deepEqual(await resultPromise, { kind: "held", reason: "target changed" });
  assert.equal(requests.length, 1);
  helper.stop();
});

test("accessibility helper times out only the request that did not receive a correlated reply", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const timers = [];
  const helper = createAccessibilityHelper({
    spawnProcess: () => child,
    requestTimeoutMs: 20,
    setRequestTimer(callback, delay) {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearRequestTimer(timer) {
      timer.cleared = true;
    },
  });
  helper.start();

  const timedOut = helper.getFocusContext();
  const delivered = helper.deliver("Text once.");
  await nextTurn();
  child.stdout.write(`{"id":"${requests[1].id}","status":"delivered","method":"pasted","verified":false}\n`);
  timers[0].callback();

  assert.deepEqual(await delivered, { kind: "inserted" });
  await assert.rejects(timedOut, /context request timed out after 20ms/);
  assert.deepEqual(
    timers.map(({ delay, cleared }) => ({ delay, cleared })),
    [
      { delay: 20, cleared: true },
      { delay: 20, cleared: true },
    ],
  );
  helper.stop();
});

test("accessibility helper ignores logs and non-contract output on stdout", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const helper = createAccessibilityHelper({ spawnProcess: () => child });
  helper.start();

  const context = helper.getFocusContext();
  await nextTurn();
  child.stdout.write("diagnostic text that belongs on stderr\n");
  child.stdout.write('{"event":"ready"}\n');
  child.stdout.write('{"id":7,"status":"ok"}\n');
  child.stdout.write(`{"id":"${requests[0].id}","status":"ok","bundleId":"com.apple.TextEdit","isOneLineField":true}\n`);

  assert.deepEqual(await context, { bundleId: "com.apple.TextEdit", isOneLineField: true });
  helper.stop();
});

test("accessibility helper keeps diagnostics on stderr and replies on stdout", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const stderrChunks = [];
  const helper = createAccessibilityHelper({
    spawnProcess: () => child,
    stderr: captureStream(stderrChunks),
  });
  helper.start();

  const context = helper.getFocusContext();
  await nextTurn();
  child.stderr.write("Accessibility access is missing\n");
  child.stdout.write(`{"id":"${requests[0].id}","status":"ok","bundleId":"com.apple.TextEdit","isOneLineField":false}\n`);

  assert.deepEqual(await context, { bundleId: "com.apple.TextEdit", isOneLineField: false });
  assert.equal(stderrChunks.join(""), "[accessibility-helper] Accessibility access is missing\n");
  helper.stop();
});

test("accessibility helper rejects in-flight work, restarts, and correlates new requests after exit", async () => {
  const firstChild = fakeProcess();
  const secondChild = fakeProcess();
  const children = [firstChild, secondChild];
  const secondRequests = readRequests(secondChild);
  const timers = [];
  const helper = createAccessibilityHelper({
    spawnProcess: () => children.shift(),
    restartDelayMs: 25,
    setRestartTimer(callback, delay) {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    stderr: captureStream([]),
  });
  helper.start();

  const interrupted = helper.getFocusContext();
  firstChild.emit("exit", 1);

  await assert.rejects(interrupted, /exited before replying/);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 25);
  timers[0].callback();

  const delivered = helper.deliver("Text after restart.");
  await nextTurn();
  assert.deepEqual(secondRequests, [{ id: "2", cmd: "insert", text: "Text after restart." }]);
  secondChild.stdout.write('{"id":"2","status":"delivered","method":"pasted","verified":false}\n');

  assert.deepEqual(await delivered, { kind: "inserted" });
  helper.stop();
});

test("a blocked accessibility request does not starve hotkey events", async () => {
  const accessibilityChild = fakeProcess();
  const hotkeyChild = fakeProcess();
  const requests = readRequests(accessibilityChild);
  const accessibility = createAccessibilityHelper({ spawnProcess: () => accessibilityChild });
  const hotkey = createHotkeyHelper({ spawnProcess: () => hotkeyChild });
  const events = [];
  hotkey.onKeyDown(() => events.push("down"));
  hotkey.onKeyUp(() => events.push("up"));
  accessibility.start();
  hotkey.start();

  const context = accessibility.getFocusContext();
  await nextTurn();
  hotkeyChild.stdout.write('{"event":"down","ts":1710000000.25}\n');
  hotkeyChild.stdout.write('{"event":"up","ts":1710000001.5}\n');
  await nextTurn();

  assert.deepEqual(events, ["down", "up"]);
  accessibilityChild.stdout.write(`{"id":"${requests[0].id}","status":"ok","bundleId":"com.apple.TextEdit","isOneLineField":false}\n`);
  await context;
  hotkey.stop();
  accessibility.stop();
});

test("accessibility helper rejects invalid protocol replies", async () => {
  const child = fakeProcess();
  const requests = readRequests(child);
  const helper = createAccessibilityHelper({ spawnProcess: () => child });
  helper.start();

  const context = helper.getFocusContext();
  await nextTurn();
  child.stdout.write(`{"id":"${requests[0].id}","status":"ok","bundleId":"com.apple.TextEdit","isOneLineField":"no"}\n`);

  await assert.rejects(context, /invalid context reply/);
  helper.stop();
});
