const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createHotkeyHelper } = require("./hotkeyHelper");

function fakeProcess() {
  const process = new EventEmitter();
  process.stdout = new PassThrough();
  process.stderr = new PassThrough();
  process.kill = () => {};
  return process;
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

  await new Promise((resolve) => setImmediate(resolve));
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

  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, []);
  helper.stop();
});
