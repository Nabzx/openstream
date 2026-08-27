import { useEffect, useState } from "react";
import type { VocabularyStatus } from "./openstreamBridge";

export default function VocabularySettings() {
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [status, setStatus] = useState<VocabularyStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setProjectPath(settings.vocabularyProjectPath));
    window.openstream.vocabulary.getStatus().then(setStatus);
  }, []);

  function applyPath(next: string | null) {
    setSaving(true);
    setError(null);
    window.openstream.settings
      .setVocabularyProjectPath(next)
      .then(({ settings, status: newStatus }) => {
        setProjectPath(settings.vocabularyProjectPath);
        setStatus(newStatus);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  function chooseFolder() {
    window.openstream.vocabulary.chooseFolder().then((chosen) => {
      if (chosen) applyPath(chosen);
    });
  }

  function rescan() {
    setSaving(true);
    setError(null);
    window.openstream.vocabulary
      .rescan()
      .then(setStatus)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setSaving(false));
  }

  return (
    <section className="setting">
      <h2>Codebase vocabulary</h2>
      <p>
        Point this at a git repo and its identifiers (function names, variable names, project-specific terms) bias
        transcription toward your project's own vocabulary. Off by default - no repo configured means no bias.
      </p>
      <div className="break-safe-add">
        <input
          type="text"
          placeholder="/path/to/your/repo"
          value={projectPath ?? ""}
          onChange={(event) => setProjectPath(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") applyPath(projectPath?.trim() || null);
          }}
          disabled={saving}
        />
        <button onClick={chooseFolder} disabled={saving}>
          Browse
        </button>
        <button onClick={() => applyPath(projectPath?.trim() || null)} disabled={saving}>
          Set
        </button>
      </div>
      {projectPath && (
        <button onClick={() => applyPath(null)} disabled={saving}>
          Clear
        </button>
      )}
      <p className="setting-current">
        {status && status.path
          ? `${status.termCount} terms from ${status.filesRead} files, last scanned ${
              status.scannedAt ? status.scannedAt.toLocaleTimeString() : "never"
            }`
          : "No project configured."}
      </p>
      <button onClick={rescan} disabled={saving || !projectPath}>
        Rescan
      </button>
      {error && <p className="setting-error">{error}</p>}
    </section>
  );
}
