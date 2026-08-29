import { useEffect, useState } from "react";
import type { SetupProgress } from "../openstreamBridge";
import Mark from "../components/Mark";

const ROLE_LABEL: Record<string, string> = {
  transcription: "Transcription model",
  rewrite: "Rewrite model",
};

function mib(bytes: number) {
  return `${Math.round(bytes / 1_048_576)} MB`;
}

export default function Setup({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    window.openstream.app.getSetupProgress().then((p) => p && setProgress(p));
    return window.openstream.onSetupProgress(setProgress);
  }, []);

  useEffect(() => {
    if (progress?.phase === "ready") {
      const t = setTimeout(onDone, 600);
      return () => clearTimeout(t);
    }
  }, [progress, onDone]);

  const error = progress?.phase === "error" ? progress.message : null;
  const downloading = progress && "role" in progress ? progress : null;
  const pct =
    downloading && downloading.total
      ? Math.min(100, Math.round(((downloading.received ?? 0) / downloading.total) * 100))
      : null;

  return (
    <main className="page">
      <div className="hero">
        <Mark tile state={error ? "attention" : "idle"} />
        <div>
          <h1>{error ? "Setup couldn’t finish" : "Setting up OpenStream"}</h1>
          <p>
            {error
              ? "The model download failed. Check your connection and try again."
              : "Downloading the local speech models — a one-time step of about 1.2 GB. Everything runs on your Mac after this."}
          </p>
        </div>
      </div>

      {error ? (
        <>
          <p className="error-text">{error}</p>
          <div className="row-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={retrying}
              onClick={() => {
                setRetrying(true);
                setProgress(null);
                window.openstream.app.retryModelDownload().finally(() => setRetrying(false));
              }}
            >
              {retrying ? "Retrying…" : "Try again"}
            </button>
          </div>
        </>
      ) : (
        <div className="card">
          {downloading ? (
            <div className="setup-item">
              <div className="setup-item__head">
                <span>{ROLE_LABEL[downloading.role] ?? downloading.role}</span>
                <span className="mono">
                  {downloading.phase === "download" && pct !== null
                    ? `${pct}%`
                    : downloading.phase === "done"
                      ? "Ready"
                      : "Checking…"}
                </span>
              </div>
              <div className="progress">
                <div className="progress__fill" style={{ width: `${pct ?? (downloading.phase === "done" ? 100 : 4)}%` }} />
              </div>
              {downloading.phase === "download" && (
                <div className="setup-item__meta mono">
                  {mib(downloading.received ?? 0)} / {mib(downloading.total ?? downloading.bytes)}
                </div>
              )}
            </div>
          ) : (
            <div className="setup-item">
              <div className="setup-item__head">
                <span>Preparing…</span>
              </div>
              <div className="progress">
                <div className="progress__fill progress__fill--indeterminate" />
              </div>
            </div>
          )}
        </div>
      )}

      <p className="hint">You can close this window; the download continues in the background.</p>
    </main>
  );
}
