const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createCrashLogStore } = require("./crashLogStore");

function tempFilePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openstream-crashlog-")), "crash-log.json");
}

test("starts empty when no crash log file exists yet", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  assert.deepEqual(store.list(), []);
});

test("record adds an entry with defaults filled in", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "uncaughtException", message: "boom", stack: "at foo (bar.js:1:1)", at: 1000 });

  const [entry] = store.list();
  assert.equal(entry.type, "uncaughtException");
  assert.equal(entry.message, "boom");
  assert.equal(entry.stack, "at foo (bar.js:1:1)");
  assert.equal(entry.at, 1000);
});

test("an unrecognised type falls back to uncaughtException, except unhandledRejection", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "somethingElse", message: "a" });
  store.record({ type: "unhandledRejection", message: "b" });

  const [second, first] = store.list();
  assert.equal(first.type, "uncaughtException");
  assert.equal(second.type, "unhandledRejection");
});

test("a missing message falls back to a placeholder rather than throwing", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "uncaughtException" });
  assert.equal(store.list()[0].message, "unknown error");
  assert.equal(store.list()[0].stack, null);
});

test("a missing at defaults to now", () => {
  const before = Date.now();
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "uncaughtException", message: "boom" });
  const after = Date.now();

  const [entry] = store.list();
  assert.ok(entry.at >= before && entry.at <= after);
});

test("newest entry is first", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "uncaughtException", message: "first", at: 1000 });
  store.record({ type: "uncaughtException", message: "second", at: 2000 });
  assert.deepEqual(
    store.list().map((entry) => entry.message),
    ["second", "first"],
  );
});

test("caps at maxEntries, dropping the oldest", () => {
  const store = createCrashLogStore({ filePath: tempFilePath(), maxEntries: 3 });
  for (let i = 0; i < 5; i++) {
    store.record({ type: "uncaughtException", message: `crash ${i}`, at: i });
  }
  assert.deepEqual(
    store.list().map((entry) => entry.message),
    ["crash 4", "crash 3", "crash 2"],
  );
});

test("clear empties the log", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  store.record({ type: "uncaughtException", message: "boom" });
  store.clear();
  assert.deepEqual(store.list(), []);
});

test("persists to disk and a fresh store reads it back", () => {
  const filePath = tempFilePath();
  const store = createCrashLogStore({ filePath });
  store.record({ type: "uncaughtException", message: "persisted", at: 42 });

  const reopened = createCrashLogStore({ filePath });
  assert.deepEqual(
    reopened.list().map((entry) => entry.message),
    ["persisted"],
  );
});

test("record is synchronous - no unresolved promise, safe to call right before process.exit", () => {
  const store = createCrashLogStore({ filePath: tempFilePath() });
  const result = store.record({ type: "uncaughtException", message: "boom" });
  // If record() ever became async, this would be a Promise, not an array -
  // this assertion is what actually enforces the synchronous contract.
  assert.ok(Array.isArray(result));
});
