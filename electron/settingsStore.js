const fs = require("fs");
const path = require("path");

// Matches hotkeyHelper.js's own default (Control+Option+D, see #84) so a
// fresh install with no settings file behaves exactly like it did before
// this existed.
const DEFAULT_SETTINGS = {
  hotkey: { keyCode: 2, modifiers: ["ctrl", "alt"] },
};

const VALID_MODIFIERS = new Set(["cmd", "shift", "alt", "ctrl"]);

function validateHotkey(hotkey) {
  if (!hotkey || typeof hotkey.keyCode !== "number" || !Number.isInteger(hotkey.keyCode) || hotkey.keyCode < 0) {
    throw new Error("hotkey.keyCode must be a non-negative integer");
  }
  if (!Array.isArray(hotkey.modifiers) || hotkey.modifiers.length === 0) {
    // A hotkey with no modifiers would fire on every ordinary keystroke of
    // that key - the native helper only ever taps global combos deliberately.
    throw new Error("hotkey.modifiers must be a non-empty array");
  }
  for (const modifier of hotkey.modifiers) {
    if (!VALID_MODIFIERS.has(modifier)) {
      throw new Error(`unknown modifier "${modifier}"`);
    }
  }
}

// filePath is injected rather than derived from app.getPath("userData")
// here, so this is testable with a plain temp file and doesn't need a real
// Electron process - the caller (main.js) is where that path gets decided.
function createSettingsStore({ filePath }) {
  let cache = null;
  const listeners = new Set();

  function load() {
    if (cache) return cache;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      cache = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      cache = { ...DEFAULT_SETTINGS };
    }
    return cache;
  }

  function persist() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
  }

  function get() {
    return { ...load() };
  }

  function setHotkey(hotkey) {
    validateHotkey(hotkey);
    cache = { ...load(), hotkey };
    persist();
    const settings = get();
    for (const listener of listeners) listener(settings);
    return settings;
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, setHotkey, onChange };
}

module.exports = { createSettingsStore, DEFAULT_SETTINGS };
