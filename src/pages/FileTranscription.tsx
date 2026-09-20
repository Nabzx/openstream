import { useEffect, useState } from "react";
import type { FileTranscriptionJob } from "../openstreamBridge";
import StatusPill, { type PillTone } from "../components/StatusPill";
import { FileIcon } from "../components/Icons";

function statusPill(status: FileTranscriptionJob["status"]): { tone: PillTone; label: string } {
  switch (status) {
    case "queued":
      return { tone: "muted", label: "Queued" };
    case "transcribing":
      return { tone: "wait", label: "Transcribing…" };
    case "done":
      return { tone: "ok", label: "Done" };
    case "failed":
      return { tone: "err", label: "Failed" };
  }
}

function elapsedLabel(job: FileTranscriptionJob, now: number): string | null {
  if (!job.startedAt) return null;
  const end = job.finishedAt ?? now;
  const seconds = Math.max(0, Math.round((end - job.startedAt) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default function FileTranscription() {
  const [jobs, setJobs] = useState<FileTranscriptionJob[]>([]);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    window.openstream.fileTranscription.getQueue().then(setJobs);
    return window.openstream.onFileTranscriptionQueue(setJobs);
  }, []);

  // The elapsed-time readout on an in-flight job needs its own clock - the
  // job list itself only changes on a status transition, not every second.
  useEffect(() => {
    if (!jobs.some((job) => job.status === "transcribing")) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [jobs]);

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const paths = Array.from(event.dataTransfer.files)
      .map((file) => window.openstream.files.getPathForFile(file))
      .filter((filePath) => filePath.length > 0);
    if (paths.length > 0) void window.openstream.fileTranscription.add(paths);
  }

  async function copyJob(id: string) {
    const result = await window.openstream.fileTranscription.copy(id);
    setMessage(result.ok ? "Copied to the clipboard." : result.reason);
  }

  async function saveJob(id: string) {
    const result = await window.openstream.fileTranscription.save(id);
    setMessage(result.ok ? `Saved to ${result.path}` : result.reason);
  }

  const hasFinished = jobs.some((job) => job.status === "done" || job.status === "failed");

  return (
    <main className="page">
      <div
        className={`drop-zone${dragging ? " drop-zone--active" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <FileIcon className="drop-zone__icon" />
        <p className="drop-zone__title">Drop audio files here</p>
        <p className="drop-zone__desc">A meeting recording, a voice memo, a lecture - or</p>
        <button
          type="button"
          className="btn"
          onClick={() => void window.openstream.fileTranscription.chooseFiles()}
        >
          Choose files…
        </button>
      </div>

      {jobs.length > 0 && (
        <div className="card">
          <div className="card-label">Queue</div>
          {jobs.map((job) => {
            const pill = statusPill(job.status);
            const time = elapsedLabel(job, now);
            return (
              <div className="row" key={job.id}>
                <span className="row-label queue-row__name">
                  {job.name}
                  {time && <small>{time}</small>}
                  {job.status === "failed" && job.error && <span className="queue-row__error">{job.error}</span>}
                </span>
                <StatusPill tone={pill.tone} label={pill.label} />
                <div className="queue-row__actions">
                  {job.status === "done" && (
                    <>
                      <button type="button" className="linkbtn" onClick={() => void copyJob(job.id)}>
                        Copy
                      </button>
                      <button type="button" className="linkbtn" onClick={() => void saveJob(job.id)}>
                        Save
                      </button>
                    </>
                  )}
                  {job.status === "failed" && (
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => void window.openstream.fileTranscription.retry(job.id)}
                    >
                      Retry
                    </button>
                  )}
                  {job.status !== "transcribing" && (
                    <button
                      type="button"
                      className="linkbtn"
                      onClick={() => void window.openstream.fileTranscription.remove(job.id)}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {hasFinished && (
            <div className="row">
              <span className="row-label" />
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => void window.openstream.fileTranscription.clearFinished()}
              >
                Clear finished
              </button>
            </div>
          )}
        </div>
      )}

      {message && <p className="hint">{message}</p>}

      <p className="hint">
        One file transcribes at a time. A long file can briefly delay a live dictation started while it's running.
      </p>
    </main>
  );
}
