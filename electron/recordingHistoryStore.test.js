const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createRecordingHistoryStore, DEFAULT_RETENTION_DAYS } = require("./recordingHistoryStore");

const DAY_MS = 24 * 60 * 60 * 1000;

function tempFilePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openstream-history-")), "recording-history.json");
}

test("starts empty when no history file exists yet", () => {
  const store = createRecordingHistoryStore({ filePath: tempFilePath() });
  assert.deepEqual(store.list(), []);
});

test("record adds an entry with defaults filled in", () => {
  // #264: retentionDays: 0 - this test's fixed `at` (1970) predates any real
  // retention window, and isn't what's under test here.
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 0 }),
  });
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
  const store = createRecordingHistoryStore({ filePath: tempFilePath(), now: () => 5000 });
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

test("#264: caps at the configured maxEntries, dropping the oldest", () => {
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 3, retentionDays: 0 }),
    now: () => 10_000,
  });
  for (let i = 0; i < 5; i++) {
    store.record({ text: `entry ${i}`, at: i });
  }
  const texts = store.list().map((entry) => entry.text);
  assert.deepEqual(texts, ["entry 4", "entry 3", "entry 2"]);
});

test("remove drops one entry by id", () => {
  // #264: retentionDays: 0, same reasoning as the test above.
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 0 }),
  });
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
  // #264: retentionDays: 0, same reasoning as the two tests above - and
  // both stores need it, since the reopened one also reads this entry back.
  const filePath = tempFilePath();
  const policy = () => ({ maxEntries: 50, retentionDays: 0 });
  const store = createRecordingHistoryStore({ filePath, getRetentionPolicy: policy });
  store.record({ text: "persisted", at: 42 });

  const reopened = createRecordingHistoryStore({ filePath, getRetentionPolicy: policy });
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

test("#264: defaults to a 30-day retention window when no policy is given", () => {
  assert.equal(DEFAULT_RETENTION_DAYS, 30);
});

test("#264: an entry older than retentionDays is dropped on the next record()", () => {
  let clock = 0;
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 7 }),
    now: () => clock,
  });
  store.record({ text: "old", at: 0 });
  clock = 8 * DAY_MS;
  store.record({ text: "new", at: clock });

  const texts = store.list().map((entry) => entry.text);
  assert.deepEqual(texts, ["new"]);
});

test("#264: an entry older than retentionDays is dropped on list() alone, with no new record()", () => {
  let clock = 0;
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 7 }),
    now: () => clock,
  });
  store.record({ text: "old", at: 0 });
  assert.equal(store.list().length, 1);

  clock = 8 * DAY_MS;
  assert.deepEqual(store.list(), []);
});

test("#264: list() persists the purge, so a fresh store also sees it gone", () => {
  let clock = 0;
  const filePath = tempFilePath();
  const store = createRecordingHistoryStore({
    filePath,
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 7 }),
    now: () => clock,
  });
  store.record({ text: "old", at: 0 });

  clock = 8 * DAY_MS;
  store.list(); // triggers the purge-and-persist

  const reopened = createRecordingHistoryStore({ filePath, getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 7 }) });
  assert.deepEqual(reopened.list(), []);
});

test("#264: retentionDays: 0 means no time-based expiry, only the count cap applies", () => {
  let clock = 0;
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => ({ maxEntries: 50, retentionDays: 0 }),
    now: () => clock,
  });
  store.record({ text: "ancient", at: 0 });
  clock = 365 * DAY_MS;

  assert.deepEqual(
    store.list().map((entry) => entry.text),
    ["ancient"],
  );
});

test("#264: a live policy change takes effect on the very next call, no store recreation needed", () => {
  let policy = { maxEntries: 50, retentionDays: 0 };
  const store = createRecordingHistoryStore({
    filePath: tempFilePath(),
    getRetentionPolicy: () => policy,
    now: () => 100 * DAY_MS,
  });
  store.record({ text: "old", at: 0 });
  assert.equal(store.list().length, 1);

  policy = { maxEntries: 50, retentionDays: 7 };
  assert.deepEqual(store.list(), []);
});
