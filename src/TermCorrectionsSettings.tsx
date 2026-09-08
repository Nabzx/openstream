import { useEffect, useState } from "react";
import type { TermCorrection } from "./openstreamBridge";

// #321: the user's "heard this, write that" table for names and project
// terms the transcription engine gets wrong. Saved on every add / remove,
// same as the break-safe app list.
export default function TermCorrectionsSettings() {
  const [entries, setEntries] = useState<TermCorrection[] | null>(null);
  const [heard, setHeard] = useState("");
  const [write, setWrite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setEntries(settings.termCorrections));
  }, []);

  function save(next: TermCorrection[]) {
    setSaving(true);
    setError(null);
    window.openstream.settings
      .setTermCorrections(next)
      .then((settings) => setEntries(settings.termCorrections))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function addEntry() {
    const h = heard.trim();
    const w = write.trim();
    if (!h || !w || !entries) return;
    if (entries.some((e) => e.heard.toLowerCase() === h.toLowerCase())) {
      setError(`"${h}" is already in the list`);
      return;
    }
    save([...entries, { heard: h, write: w }]);
    setHeard("");
    setWrite("");
  }

  function removeEntry(target: string) {
    if (!entries) return;
    save(entries.filter((e) => e.heard !== target));
  }

  return (
    <>
      <div className="correction-list">
        {entries === null ? (
          <span className="chip chip--empty">Loading…</span>
        ) : entries.length === 0 ? (
          <span className="chip chip--empty">No corrections yet</span>
        ) : (
          entries.map((entry) => (
            <div className="correction-row" key={entry.heard}>
              <span className="correction-row__heard">{entry.heard}</span>
              <span className="correction-row__arrow" aria-hidden="true">
                →
              </span>
              <span className="correction-row__write">{entry.write}</span>
              <button
                type="button"
                onClick={() => removeEntry(entry.heard)}
                disabled={saving}
                aria-label={`Remove correction for ${entry.heard}`}
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>

      <div className="setting-item__control">
        <input
          className="field"
          type="text"
          placeholder="heard"
          value={heard}
          onChange={(event) => setHeard(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addEntry();
          }}
          disabled={saving || entries === null}
          aria-label="Word or phrase as transcribed"
        />
        <span className="correction-row__arrow" aria-hidden="true">
          →
        </span>
        <input
          className="field"
          type="text"
          placeholder="write instead"
          value={write}
          onChange={(event) => setWrite(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addEntry();
          }}
          disabled={saving || entries === null}
          aria-label="What it should be written as"
        />
        <button
          type="button"
          className="btn"
          onClick={addEntry}
          disabled={saving || entries === null || heard.trim().length === 0 || write.trim().length === 0}
        >
          Add
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <p className="hint">
        A whole word or phrase, matched however it is capitalised. Runs after transcription, so it fixes a
        consistent mishearing but not a one-off.
      </p>
    </>
  );
}
