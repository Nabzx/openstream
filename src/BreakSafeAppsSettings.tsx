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
    <section className="setting">
      <h2>Break-safe applications</h2>
      <p>
        A spoken "new paragraph" only becomes a real line break in apps listed here. Everywhere else it's
        deliberately dropped, since a newline can submit a half-typed terminal command or send an unfinished
        message.
      </p>
      {apps === null ? (
        <p className="setting-current">Loading…</p>
      ) : (
        <ul className="break-safe-list">
          {apps.length === 0 && (
            <li className="break-safe-empty">No apps listed - line breaks are off everywhere.</li>
          )}
          {apps.map((bundleId) => (
            <li key={bundleId}>
              <span>{bundleId}</span>
              <button onClick={() => removeApp(bundleId)} disabled={saving} aria-label={`Remove ${bundleId}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="break-safe-add">
        <input
          type="text"
          placeholder="com.example.App"
          value={newBundleId}
          onChange={(event) => setNewBundleId(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") addApp();
          }}
          disabled={saving || apps === null}
        />
        <button onClick={addApp} disabled={saving || apps === null || newBundleId.trim().length === 0}>
          Add
        </button>
      </div>
      {error && <p className="setting-error">{error}</p>}
    </section>
  );
}
