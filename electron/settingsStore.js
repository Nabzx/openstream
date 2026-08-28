const fs = require("fs");
const path = require("path");
const { DEFAULT_BREAK_SAFE_BUNDLE_IDS } = require("./breakSafety");

// Matches hotkeyHelper.js's own default (Control+Option+D, see #84) and
// breakSafety.js's own default allow-list, so a fresh install with no
// settings file behaves exactly like it did before either was editable.
const DEFAULT_SETTINGS = {
  hotkey: { keyCode: 2, modifiers: ["ctrl", "alt"] },
  breakSafeApps: [...DEFAULT_BREAK_SAFE_BUNDLE_IDS],
  // #16: null means no project configured - vocabulary biasing is opt-in,
  // not a default every fresh install has to notice and turn off.
  vocabularyProjectPath: null,
  // #212: the desktop window's last size and position. null until the
  // window has been opened and moved/resized once; windowState.js sanity
  // -checks it against the actual display before it's used.
  windowBounds: null,
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

function validateVocabularyProjectPath(projectPath) {
  if (projectPath === null) return;
  if (typeof projectPath !== "string" || projectPath.trim().length === 0) {
    throw new Error("vocabularyProjectPath must be null or a non-empty string");
  }
}

function validateWindowBounds(bounds) {
  if (bounds === null) return;
  if (typeof bounds !== "object") {
    throw new Error("windowBounds must be null or an object");
  }
  for (const key of ["width", "height"]) {
    if (!Number.isFinite(bounds[key]) || bounds[key] <= 0) {
      throw new Error(`windowBounds.${key} must be a positive number`);
    }
  }
  for (const key of ["x", "y"]) {
    if (bounds[key] !== undefined && !Number.isFinite(bounds[key])) {
      throw new Error(`windowBounds.${key} must be a number when present`);
    }
  }
}

function validateBreakSafeApps(apps) {
  if (!Array.isArray(apps)) {
    throw new Error("breakSafeApps must be an array");
  }
  for (const bundleId of apps) {
    if (typeof bundleId !== "string" || bundleId.trim().length === 0) {
      throw new Error("each break-safe app must be a non-empty bundle id string");
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

  function setBreakSafeApps(apps) {
    validateBreakSafeApps(apps);
    cache = { ...load(), breakSafeApps: [...new Set(apps.map((bundleId) => bundleId.trim()))] };
    persist();
    const settings = get();
    for (const listener of listeners) listener(settings);
    return settings;
  }

  function setVocabularyProjectPath(projectPath) {
    validateVocabularyProjectPath(projectPath);
    cache = { ...load(), vocabularyProjectPath: projectPath === null ? null : projectPath.trim() };
    persist();
    const settings = get();
    for (const listener of listeners) listener(settings);
    return settings;
  }

  function setWindowBounds(bounds) {
    validateWindowBounds(bounds);
    // Only the four geometry keys are kept - a caller passing a whole
    // Electron Rectangle shouldn't leak extra fields into the file.
    const next =
      bounds === null
        ? null
        : {
            width: bounds.width,
            height: bounds.height,
            ...(bounds.x !== undefined ? { x: bounds.x } : {}),
            ...(bounds.y !== undefined ? { y: bounds.y } : {}),
          };
    cache = { ...load(), windowBounds: next };
    persist();
    const settings = get();
    for (const listener of listeners) listener(settings);
    return settings;
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, setHotkey, setBreakSafeApps, setVocabularyProjectPath, setWindowBounds, onChange };
}

module.exports = { createSettingsStore, DEFAULT_SETTINGS };
