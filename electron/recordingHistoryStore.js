const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// #136: a lightweight local log of recent dictations - the text, whether it
// delivered, and when - so a mis-delivery or a misheard word is recoverable
// (copy the transcript back) without redictating. This is a recall aid, not
// an archive: fixed cap, oldest dropped first, no expiry policy - that's
// #264's job if it's ever wanted.
const MAX_ENTRIES = 50;

// filePath is injected rather than derived from app.getPath("userData")
// here, same reasoning as settingsStore.js: testable with a plain temp
// file, no real Electron process needed. The caller (main.js) decides the
// real path.
function createRecordingHistoryStore({ filePath, maxEntries = MAX_ENTRIES }) {
  let cache = null;
  const listeners = new Set();

  function load() {
    if (cache) return cache;
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = JSON.parse(raw);
      cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      cache = [];
    }
    return cache;
  }

  function persist(entries) {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    try {
      fs.writeFileSync(temporaryPath, JSON.stringify(entries, null, 2));
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

  function notify(entries) {
    for (const listener of listeners) {
      try {
        listener(entries);
      } catch (error) {
        console.error(`[recording-history] change listener failed: ${errorMessage(error)}`);
      }
    }
  }

  function commit(nextEntries) {
    persist(nextEntries);
    cache = nextEntries;
    const entries = list();
    notify(entries);
    return entries;
  }

  function list() {
    return [...load()];
  }

  // A dictation that never produced text (no-speech, a failed transcription,
  // a spoken "paste") never reaches this - only "delivered" and "held"
  // outcomes carry real transcribed words worth recalling.
  function record({ text, delivered, bundleId, reason, at }) {
    if (typeof text !== "string" || !text.trim()) return list();
    const entry = {
      id: crypto.randomUUID(),
      text,
      delivered: delivered === true,
      bundleId: typeof bundleId === "string" && bundleId ? bundleId : null,
      reason: typeof reason === "string" && reason ? reason : null,
      at: typeof at === "number" ? at : Date.now(),
    };
    return commit([entry, ...load()].slice(0, maxEntries));
  }

  function remove(id) {
    return commit(load().filter((entry) => entry.id !== id));
  }

  function clear() {
    return commit([]);
  }

  function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { record, remove, clear, list, onChange };
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = { createRecordingHistoryStore, MAX_ENTRIES };
