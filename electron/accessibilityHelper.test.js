const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createAccessibilityHelper } = require("./accessibilityHelper");

function fakeProcess() {
  const process = new EventEmitter();
  process.stdin = new PassThrough();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = () => {};
  return process;
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
