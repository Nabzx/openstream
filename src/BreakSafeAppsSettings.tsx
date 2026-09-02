import { useEffect, useState } from "react";

// Friendly names for the built-in entries - kept in step with
// electron/breakSafety.js's DEFAULT_BREAK_SAFE_APP_NAMES. Anything the
// picker resolves is added to this map for the session; a manually typed
// bundle id just shows as itself.
const KNOWN_APP_NAMES: Record<string, string> = {
  "com.apple.TextEdit": "TextEdit",
  "com.apple.Notes": "Notes",
  "md.obsidian": "Obsidian",
  "com.microsoft.VSCode": "Visual Studio Code",
};

export default function BreakSafeAppsSettings() {
  const [apps, setApps] = useState<string[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>(KNOWN_APP_NAMES);
  const [newBundleId, setNewBundleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setApps(settings.breakSafeApps));
  }, []);

  function afterSave(next: Promise<{ breakSafeApps: string[] }>) {
    setSaving(true);
    setError(null);
    next
      .then((settings) => setApps(settings.breakSafeApps))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function save(next: string[]) {
    afterSave(window.openstream.settings.setBreakSafeApps(next));
  }

  function addApp() {
    const bundleId = newBundleId.trim();
    if (!bundleId || !apps) return;
    save([...apps, bundleId]);
    setNewBundleId("");
  }

  function removeApp(bundleId: string) {
    if (!apps) return;
    save(apps.filter((id) => id !== bundleId));
  }

  function pickApp() {
    if (!apps) return;
    setError(null);
    window.openstream.settings
      .pickBreakSafeApp()
      .then((picked) => {
        if (!picked) return;
        setNames((current) => ({ ...current, [picked.bundleId]: picked.name }));
        if (!apps.includes(picked.bundleId)) save([...apps, picked.bundleId]);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  function restoreDefaults() {
    afterSave(window.openstream.settings.resetBreakSafeApps());
  }

  return (
    <>
      <div className="chips-control">
        {apps === null ? (
          <span className="chip chip--empty">Loading…</span>
        ) : apps.length === 0 ? (
          <span className="chip chip--empty">No apps — line breaks are off everywhere</span>
        ) : (
          apps.map((bundleId) => (
            <span className="chip" key={bundleId}>
              {names[bundleId] ?? bundleId}
              <button
                type="button"
                onClick={() => removeApp(bundleId)}
                disabled={saving}
                aria-label={`Remove ${names[bundleId] ?? bundleId}`}
              >
                ×
              </button>
            </span>
          ))
        )}
      </div>

      <div className="setting-item__control">
        <button type="button" className="btn" onClick={pickApp} disabled={saving || apps === null}>
          Add app…
        </button>
        <button
          type="button"
          className="btn btn--ghost"
          onClick={restoreDefaults}
          disabled={saving || apps === null}
        >
          Restore defaults
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}

      <details className="settings-advanced">
        <summary>Add by bundle identifier</summary>
        <div className="setting-item__control" style={{ marginTop: 8 }}>
          <input
            className="field mono"
            type="text"
            placeholder="com.example.App"
            value={newBundleId}
            onChange={(event) => setNewBundleId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") addApp();
            }}
            disabled={saving}
          />
          <button
            type="button"
            className="btn"
            onClick={addApp}
            disabled={saving || newBundleId.trim().length === 0}
          >
            Add
          </button>
        </div>
        <p className="hint">
          Find an app’s identifier with <span className="mono">osascript -e 'id of app "…"'</span>.
        </p>
      </details>
    </>
  );
}
