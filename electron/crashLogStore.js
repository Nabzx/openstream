const fs = require("fs");
const path = require("path");

// #138: a local, capped log of main-process crashes - uncaught exceptions and
// unhandled promise rejections - so a user can copy it into a bug report.
// Nothing is sent anywhere; this is a file on disk, not a telemetry service.
// Deliberately synchronous throughout (unlike settingsStore.js's shape):
// record() is called from inside an uncaughtException handler, where the
// process may be moments from exiting - no Promise chain, nothing that
// might not finish before that happens.
const MAX_ENTRIES = 20;

function createCrashLogStore({ filePath, maxEntries = MAX_ENTRIES }) {
  let cache = null;

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

  function list() {
    return [...load()];
  }

  function record({ type, message, stack, at }) {
    const entry = {
      type: type === "unhandledRejection" ? "unhandledRejection" : "uncaughtException",
      message: typeof message === "string" && message ? message : "unknown error",
      stack: typeof stack === "string" && stack ? stack : null,
      at: typeof at === "number" ? at : Date.now(),
    };
    const next = [entry, ...load()].slice(0, maxEntries);
    persist(next);
    cache = next;
    return list();
  }

  function clear() {
    persist([]);
    cache = [];
    return [];
  }

  return { record, list, clear };
}

module.exports = { createCrashLogStore, MAX_ENTRIES };
