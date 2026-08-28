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
};

const VALID_MODIFIERS = new Set(["cmd", "shift", "alt", "ctrl"]);

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateShortcut(shortcut) {
  if (!shortcut || typeof shortcut.keyCode !== "number" || !Number.isInteger(shortcut.keyCode) || shortcut.keyCode < 0) {
    throw new Error("shortcut.keyCode must be a non-negative integer");
  }
  if (!Array.isArray(shortcut.modifiers) || shortcut.modifiers.length === 0) {
    // A shortcut with no modifiers would fire on every ordinary keystroke of
    // that key - the native helper only ever taps global combos deliberately.
    throw new Error("shortcut.modifiers must be a non-empty array");
  }
  for (const modifier of shortcut.modifiers) {
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

  function persist(settings) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2));
  }

  function notify(settings) {
    for (const listener of listeners) {
      try {
        listener(settings);
      } catch (error) {
        console.error(`[settings] change listener failed: ${errorMessage(error)}`);
      }
    }
  }

  function commit(nextSettings) {
    persist(nextSettings);
    cache = nextSettings;
    const settings = get();
    notify(settings);
    return settings;
  }

  function get() {
    return { ...load() };
  }

  function setShortcut(shortcut) {
    validateShortcut(shortcut);
    return commit({ ...load(), hotkey: shortcut });
  }

  // Keep the old method name for callers that use the pre-transaction store
  // directly. The persisted field remains `hotkey` for the same reason.
  function setHotkey(hotkey) {
    return setShortcut(hotkey);
  }

  function setBreakSafeApps(apps) {
    validateBreakSafeApps(apps);
    return commit({ ...load(), breakSafeApps: [...new Set(apps.map((bundleId) => bundleId.trim()))] });
  }

  function setVocabularyProjectPath(projectPath) {
    validateVocabularyProjectPath(projectPath);
    return commit({ ...load(), vocabularyProjectPath: projectPath === null ? null : projectPath.trim() });
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, setShortcut, setHotkey, setBreakSafeApps, setVocabularyProjectPath, onChange };
}

module.exports = {
  createSettingsStore,
  DEFAULT_SETTINGS,
  validateShortcut,
  validateHotkey: validateShortcut,
};
