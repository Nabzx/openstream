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
      <div className="card">
        {apps === null ? (
          <div className="row">
            <span className="row-label">Loading…</span>
          </div>
        ) : (
          <>
            {apps.length === 0 && (
              <div className="row">
                <span className="row-label" style={{ color: "var(--text-2)" }}>
                  No apps listed — line breaks are off everywhere.
                </span>
              </div>
            )}
            {apps.map((bundleId) => (
              <div className="row" key={bundleId}>
                <span className="row-label">
                  {names[bundleId] ?? bundleId}
                  {names[bundleId] && <small className="mono">{bundleId}</small>}
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => removeApp(bundleId)}
                  disabled={saving}
                  aria-label={`Remove ${names[bundleId] ?? bundleId}`}
                >
                  Remove
                </button>
              </div>
            ))}
            <div className="row">
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
          </>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      <div className="row-actions">
        <button type="button" className="btn" onClick={pickApp} disabled={saving || apps === null}>
          Add application…
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
      <p className="hint">
        “Add application…” picks an app and reads its bundle identifier for you. To add one by hand, find its
        identifier with <span className="mono">osascript -e 'id of app "…"'</span>.
      </p>
    </>
  );
}
