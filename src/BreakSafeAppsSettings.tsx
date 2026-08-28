import { useEffect, useState } from "react";

export default function BreakSafeAppsSettings() {
  const [apps, setApps] = useState<string[] | null>(null);
  const [newBundleId, setNewBundleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setApps(settings.breakSafeApps));
  }, []);

  function save(next: string[]) {
    setSaving(true);
    setError(null);
    window.openstream.settings
      .setBreakSafeApps(next)
      .then((settings) => setApps(settings.breakSafeApps))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
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
                <span className="row-label mono">{bundleId}</span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => removeApp(bundleId)}
                  disabled={saving}
                  aria-label={`Remove ${bundleId}`}
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
      <p className="hint">
        Find an app’s bundle identifier with{" "}
        <span className="mono">osascript -e 'id of app "…"'</span>.
      </p>
    </>
  );
}
