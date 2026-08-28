const fs = require("fs");
const path = require("path");
const { DEFAULT_BREAK_SAFE_BUNDLE_IDS } = require("./breakSafety");
const { STANDALONE_OPTION_KEY_CODE, isSupportedSingleKeyShortcut } = require("./hotkeyDefinitions");

// Matches hotkeyHelper.js's standalone Option default and breakSafety.js's
// own default allow-list. Existing settings are read as-is below so this
// only affects a fresh install with no settings file.
const DEFAULT_SETTINGS = {
  hotkey: { keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] },
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

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function validateShortcut(shortcut) {
  if (!shortcut || typeof shortcut.keyCode !== "number" || !Number.isInteger(shortcut.keyCode) || shortcut.keyCode < 0) {
    throw new Error("shortcut.keyCode must be a non-negative integer");
  }
  if (!Array.isArray(shortcut.modifiers)) {
    throw new Error("shortcut.modifiers must be an array");
  }
  if (shortcut.modifiers.length === 0 && !isSupportedSingleKeyShortcut(shortcut)) {
    throw new Error("Unsupported key");
  }

  for (const modifier of shortcut.modifiers) {
    if (!VALID_MODIFIERS.has(modifier)) {
      throw new Error(`unknown modifier "${modifier}"`);
    }
  }
}

function validateNewShortcut(shortcut) {
  validateShortcut(shortcut);
  if (!isSupportedSingleKeyShortcut(shortcut)) throw new Error("Unsupported key");
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

  function persist(settings) {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(settings, null, 2));
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      try {
        fs.unlinkSync(temporaryPath);
      } catch {
        // The temporary file may not have been created.
      }
      throw error;
    }
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
    return commit({ ...load(), windowBounds: next });
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, setShortcut, setHotkey, setBreakSafeApps, setVocabularyProjectPath, setWindowBounds, onChange };
}

module.exports = {
  createSettingsStore,
  DEFAULT_SETTINGS,
  validateShortcut,
  validateNewShortcut,
  validateHotkey: validateShortcut,
};
