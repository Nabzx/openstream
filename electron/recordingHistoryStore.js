const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// #136: a lightweight local log of recent dictations - the text, whether it
// delivered, and when - so a mis-delivery or a misheard word is recoverable
// (copy the transcript back) without redictating. This is a recall aid, not
// an archive: capped and time-boxed, oldest dropped first.
const MAX_ENTRIES = 50;
// #264: 0 means "keep forever" (still bounded by maxEntries) - a privacy
// -conscious default keeps some real expiry active out of the box rather
// than making the user find the setting first.
const DEFAULT_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// filePath is injected rather than derived from app.getPath("userData")
// here, same reasoning as settingsStore.js: testable with a plain temp
// file, no real Electron process needed. The caller (main.js) decides the
// real path.
//
// #264: the cap and the time window are read fresh on every write/read via
// getRetentionPolicy, an adapter (same shape as dictationCoordinator.js's
// corrections/language options) rather than baked into the constructor -
// they're live Settings values, so a change takes effect on the very next
// dictation without recreating the store. now is injectable for tests.
function createRecordingHistoryStore({
  filePath,
  getRetentionPolicy = () => ({ maxEntries: MAX_ENTRIES, retentionDays: DEFAULT_RETENTION_DAYS }),
  now = () => Date.now(),
}) {
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
    const entries = list({ skipPurge: true });
    notify(entries);
    return entries;
  }

  // #264: applied on every read and write, not just at record() time - a
  // retention window means old entries are gone even if the user never
  // dictates again to trigger a cleanup, not just hidden once one does.
  function purge(entries) {
    const policy = getRetentionPolicy() || {};
    const maxEntries = Number.isInteger(policy.maxEntries) && policy.maxEntries >= 0 ? policy.maxEntries : MAX_ENTRIES;
    const retentionDays = Number.isInteger(policy.retentionDays) && policy.retentionDays >= 0 ? policy.retentionDays : 0;
    const cutoff = retentionDays > 0 ? now() - retentionDays * DAY_MS : null;
    const withinWindow = cutoff === null ? entries : entries.filter((entry) => entry.at >= cutoff);
    return withinWindow.slice(0, maxEntries);
  }

  // list() (and therefore every read) actively purges and persists rather
  // than just filtering the view - an expired entry is meant to be gone
  // from disk, not merely hidden from whoever asked. skipPurge is for
  // commit(), which just wrote the already-purged set and would otherwise
  // re-purge (harmless, but a wasted read+maybe-write) on its own result.
  function list({ skipPurge = false } = {}) {
    const loaded = load();
    if (skipPurge) return [...loaded];
    const purged = purge(loaded);
    if (purged.length !== loaded.length) {
      persist(purged);
      cache = purged;
    }
    return [...purged];
  }

  function record({ text, delivered, bundleId, reason, at }) {
    if (typeof text !== "string" || !text.trim()) return list();
    const entry = {
      id: crypto.randomUUID(),
      text,
      delivered: delivered === true,
      bundleId: typeof bundleId === "string" && bundleId ? bundleId : null,
      reason: typeof reason === "string" && reason ? reason : null,
      at: typeof at === "number" ? at : now(),
    };
    return commit(purge([entry, ...load()]));
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

module.exports = { createRecordingHistoryStore, MAX_ENTRIES, DEFAULT_RETENTION_DAYS };
