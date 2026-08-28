import { useEffect, useState } from "react";
import type { AppHealth, MediaAccessStatus, StoredSettings } from "../openstreamBridge";
import KeyCaps from "../components/KeyCaps";
import StatusPill, { type PillTone } from "../components/StatusPill";
import {
  ClockIcon,
  InputMonitorIcon,
  KeyboardIcon,
  MicIcon,
  ShieldIcon,
  WaveformIcon,
} from "../components/Icons";

const HEALTH_POLL_MS = 4000;

function boolPill(granted: boolean): { tone: PillTone; label: string } {
  return granted ? { tone: "ok", label: "Granted" } : { tone: "err", label: "Not granted" };
}

function micPill(status: MediaAccessStatus): { tone: PillTone; label: string } {
  switch (status) {
    case "granted":
      return { tone: "ok", label: "Granted" };
    case "denied":
    case "restricted":
      return { tone: "err", label: "Denied" };
    case "not-determined":
      return { tone: "wait", label: "Not asked yet" };
    default:
      return { tone: "muted", label: "Unknown" };
  }
}

function modelPill(state: "ready" | "starting"): { tone: PillTone; label: string } {
  return state === "ready"
    ? { tone: "ok", label: "Ready" }
    : { tone: "wait", label: "Starting…" };
}

export default function Home({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [settings, setSettings] = useState<StoredSettings | null>(null);
  const [health, setHealth] = useState<AppHealth | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then(setSettings);
  }, []);

  useEffect(() => {
    let active = true;
    const poll = () => {
      window.openstream.app.getHealth().then((next) => {
        if (active) setHealth(next);
      });
    };
    poll();
    const timer = setInterval(poll, HEALTH_POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  const rows: { icon: JSX.Element; label: string; sub?: string; pill: { tone: PillTone; label: string } }[] =
    health
      ? [
          { icon: <ShieldIcon className="row-icon" />, label: "Accessibility", pill: boolPill(health.accessibility) },
          {
            icon: <InputMonitorIcon className="row-icon" />,
            label: "Input Monitoring",
            pill: { tone: "muted", label: "Checked on first use" },
          },
          { icon: <MicIcon className="row-icon" />, label: "Microphone", pill: micPill(health.microphone) },
          {
            icon: <WaveformIcon className="row-icon" />,
            label: "Transcription model",
            sub: "Local · whisper.cpp",
            pill: modelPill(health.transcriptionModel),
          },
          {
            icon: <WaveformIcon className="row-icon" />,
            label: "Rewrite model",
            sub: "Local · paragraph breaks",
            pill: modelPill(health.rewriteModel),
          },
        ]
      : [];

  return (
    <main className="page">
      <div className="hero">
        <span className="beacon" data-state="idle" />
        <div>
          <h1>OpenStream is listening</h1>
          <p>
            {settings ? (
              <>
                Hold <KeyCaps hotkey={settings.hotkey} /> anywhere and speak — your words land at the cursor.
              </>
            ) : (
              "Loading…"
            )}
          </p>
        </div>
      </div>

      <div className="card">
        <div className="row">
          <KeyboardIcon className="row-icon" />
          <span className="row-label">Push-to-talk shortcut</span>
          {settings && <KeyCaps hotkey={settings.hotkey} />}
          <button type="button" className="linkbtn" style={{ marginLeft: 10 }} onClick={onOpenSettings}>
            Change
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Status</div>
        {rows.length === 0 ? (
          <div className="row">
            <span className="row-label">Checking…</span>
          </div>
        ) : (
          rows.map((row) => (
            <div className="row" key={row.label}>
              {row.icon}
              <span className="row-label">
                {row.label}
                {row.sub && <small>{row.sub}</small>}
              </span>
              <StatusPill tone={row.pill.tone} label={row.pill.label} />
            </div>
          ))
        )}
      </div>

      <div className="card">
        <div className="card-label">Recent</div>
        <div className="empty">
          <ClockIcon />
          <span>Your recent dictations will appear here.</span>
        </div>
      </div>
    </main>
  );
}
