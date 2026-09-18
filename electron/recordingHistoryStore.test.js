const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRecordingHistoryStore } = require("./recordingHistoryStore");

function tempFilePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openstream-history-")), "recording-history.json");
}

test("starts empty when no history file exists yet", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  assert.deepEqual(store.list(), []);
});

test("record adds an entry with defaults filled in", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "hello world", delivered: true, bundleId: "com.apple.Notes", at: 1000 });

  const [entry] = store.list();
  assert.equal(entry.text, "hello world");
  assert.equal(entry.delivered, true);
  assert.equal(entry.bundleId, "com.apple.Notes");
  assert.equal(entry.reason, null);
  assert.equal(entry.at, 1000);
  assert.equal(typeof entry.id, "string");
  assert.ok(entry.id.length > 0);
});

test("record ignores an empty or whitespace-only transcript", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "", delivered: true });
  store.record({ text: "   ", delivered: true });
  assert.deepEqual(store.list(), []);
});

test("newest entry is first", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "first", at: 1000 });
  store.record({ text: "second", at: 2000 });
  const texts = store.list().map((entry) => entry.text);
  assert.deepEqual(texts, ["second", "first"]);
});

test("held entries carry a reason and delivered: false", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "held text", delivered: false, reason: "delivery could not proceed" });
  const [entry] = store.list();
  assert.equal(entry.delivered, false);
  assert.equal(entry.reason, "delivery could not proceed");
});

test("caps at maxEntries, dropping the oldest", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath(), maxEntries: 3 });
  for (let i = 0; i < 5; i++) {
    store.record({ text: `entry ${i}`, at: i });
  }
  const texts = store.list().map((entry) => entry.text);
  assert.deepEqual(texts, ["entry 4", "entry 3", "entry 2"]);
});

test("remove drops one entry by id", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "keep", at: 1 });
  store.record({ text: "drop", at: 2 });
  const target = store.list().find((entry) => entry.text === "drop");

  store.remove(target.id);

  const texts = store.list().map((entry) => entry.text);
  assert.deepEqual(texts, ["keep"]);
});

test("clear empties the history", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  store.record({ text: "one" });
  store.record({ text: "two" });
  store.clear();
  assert.deepEqual(store.list(), []);
});

test("persists to disk and a fresh store reads it back", () => {
  const filePath = tempFilePath();
  const store = createRecordingHistoryStore({ filePath });
  store.record({ text: "persisted", at: 42 });

  const reopened = createRecordingHistoryStore({ filePath });
  assert.deepEqual(
    reopened.list().map((entry) => entry.text),
    ["persisted"],
  );
});

test("onChange notifies listeners with the new list, and the unsubscribe works", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  const seen = [];
  const unsubscribe = store.onChange((entries) => seen.push(entries.length));

  store.record({ text: "one" });
  store.record({ text: "two" });
  unsubscribe();
  store.record({ text: "three" });

  assert.deepEqual(seen, [1, 2]);
});

test("a listener that throws does not break the commit or other listeners", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  const seen = [];
  store.onChange(() => {
    throw new Error("boom");
  });
  store.onChange((entries) => seen.push(entries.length));

  store.record({ text: "one" });

  assert.deepEqual(seen, [1]);
  assert.equal(store.list().length, 1);
});
