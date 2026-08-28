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

test("a partial disk write leaves the cached and saved shortcut unchanged", () => {
  const filePath = tempFilePath();
  const store = createSettingsStore({ filePath });
  store.setHotkey({ keyCode: 2, modifiers: ["ctrl", "alt"] });
  const writeFileSync = fs.writeFileSync;
  fs.writeFileSync = (temporaryPath, contents) => {
    writeFileSync(temporaryPath, String(contents).slice(0, 10));
    throw new Error("disk is read-only");
  };

  try {
    assert.throws(() => store.setHotkey({ keyCode: 49, modifiers: ["cmd"] }), /read-only/);
  } finally {
    fs.writeFileSync = writeFileSync;
  }

  assert.deepEqual(store.get().hotkey, { keyCode: 2, modifiers: ["ctrl", "alt"] });
  assert.deepEqual(JSON.parse(fs.readFileSync(filePath, "utf8")).hotkey, { keyCode: 2, modifiers: ["ctrl", "alt"] });
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

test("setBreakSafeApps persists to disk and get() reflects it afterwards", () => {
  const filePath = tempFilePath();
  const store = createSettingsStore({ filePath });

  store.setBreakSafeApps(["com.apple.Terminal", "com.googlecode.iterm2"]);
  assert.deepEqual(store.get().breakSafeApps, ["com.apple.Terminal", "com.googlecode.iterm2"]);

  const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(onDisk.breakSafeApps, ["com.apple.Terminal", "com.googlecode.iterm2"]);
});

test("setBreakSafeApps trims whitespace and dedupes", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setBreakSafeApps([" com.apple.Terminal ", "com.apple.Terminal"]);
  assert.deepEqual(store.get().breakSafeApps, ["com.apple.Terminal"]);
});

test("setBreakSafeApps accepts an empty list - deny-by-default is a valid choice", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setBreakSafeApps([]);
  assert.deepEqual(store.get().breakSafeApps, []);
});

test("rejects a non-array breakSafeApps", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setBreakSafeApps("com.apple.Terminal"), /array/);
});

test("rejects a blank bundle id", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setBreakSafeApps(["com.apple.Terminal", "  "]), /non-empty bundle id/);
});

test("an invalid setBreakSafeApps call leaves the previous value untouched", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setBreakSafeApps(["com.apple.Terminal"]);

  assert.throws(() => store.setBreakSafeApps(["  "]));
  assert.deepEqual(store.get().breakSafeApps, ["com.apple.Terminal"]);
});

test("vocabularyProjectPath defaults to null", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.equal(store.get().vocabularyProjectPath, null);
});

test("setVocabularyProjectPath persists a trimmed path and get() reflects it afterwards", () => {
  const filePath = tempFilePath();
  const store = createSettingsStore({ filePath });

  store.setVocabularyProjectPath("  /Users/me/code/myapp  ");
  assert.equal(store.get().vocabularyProjectPath, "/Users/me/code/myapp");

  const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(onDisk.vocabularyProjectPath, "/Users/me/code/myapp");
});

test("setVocabularyProjectPath(null) clears a previously-set path", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setVocabularyProjectPath("/Users/me/code/myapp");
  store.setVocabularyProjectPath(null);
  assert.equal(store.get().vocabularyProjectPath, null);
});

test("rejects an empty-string vocabularyProjectPath", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setVocabularyProjectPath("   "), /non-empty string/);
});

test("rejects a non-string, non-null vocabularyProjectPath", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setVocabularyProjectPath(42), /non-empty string/);
});

test("windowBounds defaults to null", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.equal(store.get().windowBounds, null);
});

test("setWindowBounds persists only the geometry keys", () => {
  const filePath = tempFilePath();
  const store = createSettingsStore({ filePath });

  store.setWindowBounds({ x: 10, y: 20, width: 800, height: 600, extra: "nope" });
  assert.deepEqual(store.get().windowBounds, { x: 10, y: 20, width: 800, height: 600 });

  const onDisk = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.deepEqual(onDisk.windowBounds, { x: 10, y: 20, width: 800, height: 600 });
});

test("setWindowBounds allows omitting the position", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setWindowBounds({ width: 800, height: 600 });
  assert.deepEqual(store.get().windowBounds, { width: 800, height: 600 });
});

test("setWindowBounds(null) clears a saved rectangle", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  store.setWindowBounds({ width: 800, height: 600 });
  store.setWindowBounds(null);
  assert.equal(store.get().windowBounds, null);
});

test("rejects windowBounds with a non-positive size", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setWindowBounds({ width: 0, height: 600 }), /positive number/);
});

test("rejects windowBounds with a non-numeric position", () => {
  const store = createSettingsStore({ filePath: tempFilePath() });
  assert.throws(() => store.setWindowBounds({ width: 800, height: 600, x: "left" }), /must be a number/);
});
