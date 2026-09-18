import { useEffect, useState } from "react";
import type { RecordingHistoryEntry } from "../openstreamBridge";
import { ClockIcon } from "../components/Icons";

// #136: recompute "3m ago" labels periodically without a per-entry timer -
// a minute of staleness on a recall aid is unnoticeable, so a shared tick
// is plenty.
const RELATIVE_TIME_TICK_MS = 30_000;

function formatRelativeTime(at: number, now: number): string {
  const diffMs = now - at;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(at).toLocaleDateString();
}

export default function History() {
  const [entries, setEntries] = useState<RecordingHistoryEntry[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    window.openstream.recordingHistory.get().then(setEntries);
    return window.openstream.onRecordingHistory(setEntries);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), RELATIVE_TIME_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  function copy(entry: RecordingHistoryEntry) {
    window.openstream.recordingHistory.copy(entry.text).then((ok) => {
      if (!ok) return;
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((current) => (current === entry.id ? null : current)), 1500);
    });
  }

  function remove(id: string) {
    window.openstream.recordingHistory.remove(id).then(setEntries);
  }

  function clearAll() {
    window.openstream.recordingHistory.clear().then(setEntries);
  }

  return (
    <main className="page">
      <div className="hero">
        <div>
          <h1>Recent dictations</h1>
          <p>
            {/* MAX_ENTRIES in electron/recordingHistoryStore.js - keep in sync. */}
            Your last 50 finished dictations, held locally on this Mac - not synced, not sent anywhere. A misheard
            word or a mis-delivery is recoverable here without redictating.
          </p>
        </div>
      </div>

      <div className="card">
        {entries === null ? (
          <div className="row">
            <span className="row-label">Loading…</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="row">
            <ClockIcon className="row-icon" />
            <span className="row-label">
              Nothing yet
              <small>Your next dictation will show up here.</small>
            </span>
          </div>
        ) : (
          entries.map((entry) => (
            <div className="row" key={entry.id}>
              <span className="row-label">
                <div className="history-row__text">{entry.text}</div>
                <small>
                  {formatRelativeTime(entry.at, now)}
                  {entry.bundleId ? ` · ${entry.bundleId}` : ""}
                  {!entry.delivered ? ` · held — ${entry.reason ?? "couldn't be delivered"}` : ""}
                </small>
              </span>
              <button type="button" className="linkbtn" onClick={() => copy(entry)}>
                {copiedId === entry.id ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                className="linkbtn"
                onClick={() => remove(entry.id)}
                aria-label="Remove from history"
              >
                Remove
              </button>
            </div>
          ))
        )}
      </div>

      {entries !== null && entries.length > 0 && (
        <div className="row-actions">
          <button type="button" className="btn btn--ghost" onClick={clearAll}>
            Clear history
          </button>
        </div>
      )}
    </main>
  );
}
