const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createSettingsStore, DEFAULT_SETTINGS } = require("./settingsStore");

function tempFilePath() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), "openstream-settings-")), "settings.json");
}

test("returns defaults when no settings file exists yet", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);
});

test("setHotkey persists to disk and get() reflects it afterwards", () => {
  const filePath = tempFilePath();
  const store = createSettingsStore({ filePath });

  store.setHotkey({ keyCode: 49, modifiers: ["cmd", "shift"] });
  assert.deepEqual(store.get().hotkey, { keyCode: 49, modifiers: ["cmd", "shift"] });

  const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(onDisk.hotkey, { keyCode: 49, modifiers: ["cmd", "shift"] });
});

test("a fresh store reads back what an earlier store wrote", () => {
  const filePath = tempFilePath();
  createSettingsStore({ filePath }).setHotkey({ keyCode: 0, modifiers: ["ctrl"] });

  const reopened = createSettingsStore({ filePath });
  assert.deepEqual(reopened.get().hotkey, { keyCode: 0, modifiers: ["ctrl"] });
});

test("rejects a hotkey with no modifiers", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setHotkey({ keyCode: 2, modifiers: [] }), /non-empty/);
});

test("rejects an unknown modifier", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setHotkey({ keyCode: 2, modifiers: ["fn"] }), /unknown modifier/);
});

test("rejects a non-integer keyCode", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setHotkey({ keyCode: 2.5, modifiers: ["cmd"] }), /keyCode/);
});

test("an invalid setHotkey call leaves the previous value untouched", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setHotkey({ keyCode: 2, modifiers: ["ctrl", "alt"] });

  assert.throws(() => store.setHotkey({ keyCode: 2, modifiers: [] }));
  assert.deepEqual(store.get().hotkey, { keyCode: 2, modifiers: ["ctrl", "alt"] });
});

test("onChange fires with the new settings after a successful setHotkey", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  const seen = [];
  store.onChange((settings) => seen.push(settings));

  store.setHotkey({ keyCode: 3, modifiers: ["cmd"] });

  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].hotkey, { keyCode: 3, modifiers: ["cmd"] });
});

test("a corrupt settings file falls back to defaults instead of throwing", () => {
  const filePath = tempFilePath();
  fs.writeFileSync(filePath, "{ not valid json");
  const store = createSettingsStore({ filePath });
  assert.deepEqual(store.get(), DEFAULT_SETTINGS);
});
