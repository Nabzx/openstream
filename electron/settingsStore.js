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
  // #321: user-maintained "heard this, write that" corrections for names and
  // project terms the transcription engine gets wrong. Empty by default.
  termCorrections: [],
  // #212: the desktop window's last size and position. null until the
  // window has been opened and moved/resized once; windowState.js sanity
  // -checks it against the actual display before it's used.
  windowBounds: null,
  // #255: also put every finished dictation on the clipboard, so a paste
  // that doesn't land is never a lost dictation. Off by default - it
  // clobbers whatever the user had copied.
  copyTranscriptToClipboard: false,
  // #257: unload the model servers after this many minutes idle, reloading
  // (with a one-time warm-up) on the next dictation. 0 = off, stay resident.
  idleUnloadMinutes: 0,
};

// #257: a whole number of minutes, 0 (off) to a day. A day is already well
// past "why is my first dictation slow" territory - the cap is just a guard
// against a nonsense value from a hand-edited file.
const MAX_IDLE_UNLOAD_MINUTES = 1440;

function validateIdleUnloadMinutes(minutes) {
  if (typeof minutes !== "number" || !Number.isInteger(minutes) || minutes < 0 || minutes > MAX_IDLE_UNLOAD_MINUTES) {
    throw new Error(`idleUnloadMinutes must be a whole number of minutes between 0 and ${MAX_IDLE_UNLOAD_MINUTES}`);
  }
}

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

// #321: a bound on the list keeps the per-dictation regex work trivial (each
// entry is one cheap pass in cleanup()) and stops a runaway renderer edit
// bloating the settings file. 200 names/terms is far more than any real list.
const MAX_TERM_CORRECTIONS = 200;
const MAX_TERM_CORRECTION_LENGTH = 80;

function validateTermCorrections(entries) {
  if (!Array.isArray(entries)) {
    throw new Error("termCorrections must be an array");
  }
  if (entries.length > MAX_TERM_CORRECTIONS) {
    throw new Error(`termCorrections cannot hold more than ${MAX_TERM_CORRECTIONS} entries`);
  }
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new Error("each term correction must be an object");
    }
    for (const key of ["heard", "write"]) {
      if (typeof entry[key] !== "string" || entry[key].trim().length === 0) {
        throw new Error(`each term correction needs a non-empty "${key}" string`);
      }
      if (entry[key].length > MAX_TERM_CORRECTION_LENGTH) {
        throw new Error(`term correction "${key}" cannot exceed ${MAX_TERM_CORRECTION_LENGTH} characters`);
      }
    }
  }
}

function normaliseTermCorrections(entries) {
  const seen = new Set();
  const kept = [];
  for (const entry of entries) {
    const heard = entry.heard.trim();
    const write = entry.write.trim();
    const key = heard.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ heard, write });
  }
  return kept;
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

  function setTermCorrections(entries) {
    validateTermCorrections(entries);
    return commit({ ...load(), termCorrections: normaliseTermCorrections(entries) });
  }

  function setCopyTranscriptToClipboard(enabled) {
    if (typeof enabled !== "boolean") {
      throw new Error("copyTranscriptToClipboard must be a boolean");
    }
    return commit({ ...load(), copyTranscriptToClipboard: enabled });
  }

  function setIdleUnloadMinutes(minutes) {
    validateIdleUnloadMinutes(minutes);
    return commit({ ...load(), idleUnloadMinutes: minutes });
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

  return {
    get,
    setShortcut,
    setHotkey,
    setBreakSafeApps,
    setVocabularyProjectPath,
    setTermCorrections,
    setCopyTranscriptToClipboard,
    setIdleUnloadMinutes,
    setWindowBounds,
    onChange,
  };
}

module.exports = {
  createSettingsStore,
  DEFAULT_SETTINGS,
  validateShortcut,
  validateNewShortcut,
  validateHotkey: validateShortcut,
  validateTermCorrections,
  MAX_TERM_CORRECTIONS,
  MAX_TERM_CORRECTION_LENGTH,
  validateIdleUnloadMinutes,
  MAX_IDLE_UNLOAD_MINUTES,
};
