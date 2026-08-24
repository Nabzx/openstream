const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");
const { createHotkeyHelper, DEFAULT_HOTKEY } = require("./hotkeyHelper");

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
  assert.deepEqual(spawned[0].args, ["--keycode", String(DEFAULT_HOTKEY.keyCode), "--modifiers", DEFAULT_HOTKEY.modifiers.join(",")]);
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
