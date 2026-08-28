import { useEffect, useState } from "react";
import type { AppHealth, GrantState, ModelHealth, StoredSettings } from "../openstreamBridge";
import type { Page } from "../nav";
import KeyCaps from "../components/KeyCaps";
import StatusPill, { type PillTone } from "../components/StatusPill";
import {
  InputMonitorIcon,
  KeyboardIcon,
  MicIcon,
  ShieldIcon,
  WaveformIcon,
} from "../components/Icons";

const HEALTH_POLL_MS = 4000;

function grantPill(state: GrantState): { tone: PillTone; label: string } {
  switch (state) {
    case "granted":
      return { tone: "ok", label: "Granted" };
    case "missing":
      return { tone: "err", label: "Not granted" };
    case "pending":
      return { tone: "wait", label: "Not asked yet" };
    default:
      return { tone: "muted", label: "Unknown" };
  }
}

function modelPill(state: ModelHealth): { tone: PillTone; label: string } {
  return state === "ready"
    ? { tone: "ok", label: "Ready" }
    : { tone: "wait", label: "Starting…" };
}

export default function Home({ navigate }: { navigate: (page: Page) => void }) {
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
          {
            icon: <ShieldIcon className="row-icon" />,
            label: "Accessibility",
            pill: grantPill(health.permissions.accessibility),
          },
          {
            icon: <InputMonitorIcon className="row-icon" />,
            label: "Input Monitoring",
            pill: grantPill(health.permissions.inputMonitoring),
          },
          {
            icon: <MicIcon className="row-icon" />,
            label: "Microphone",
            pill: grantPill(health.permissions.microphone),
          },
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

  const permissionsNeedAttention =
    health && (health.permissions.accessibility !== "granted" || health.permissions.inputMonitoring === "missing");
  const ready =
    health &&
    !permissionsNeedAttention &&
    health.transcriptionModel === "ready" &&
    health.rewriteModel === "ready";

  return (
    <main className="page">
      <div className="hero">
        <span className="beacon" data-state={permissionsNeedAttention ? "attention" : "idle"} />
        <div>
          <h1>{permissionsNeedAttention ? "OpenStream needs a moment" : "OpenStream is listening"}</h1>
          <p>
            {settings ? (
              <>
                Hold <KeyCaps hotkey={settings.hotkey} /> anywhere and speak — your words land at the cursor. Press{" "}
                <kbd className="keycap">esc</kbd> to cancel a recording.
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
          <button type="button" className="linkbtn" style={{ marginLeft: 10 }} onClick={() => navigate("settings")}>
            Change
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-label">System</div>
        {permissionsNeedAttention ? (
          <div className="row">
            <span className="row-label" style={{ color: "var(--err)" }}>
              A required permission is missing — push-to-talk won{"’"}t work.
            </span>
            <button type="button" className="btn btn--primary" onClick={() => navigate("permissions")}>
              Fix
            </button>
          </div>
        ) : (
          <div className="row">
            <span className="row-label">{ready ? "Everything is ready" : "Getting ready…"}</span>
            <StatusPill tone={ready ? "ok" : "wait"} label={ready ? "All set" : "Starting"} />
          </div>
        )}
        {rows.length === 0 ? (
          <div className="row">
            <span className="row-label" style={{ color: "var(--text-2)" }}>
              Checking…
            </span>
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

      <p className="hint">
        OpenStream lives in the menu bar. Closing this window leaves it running; quit from the menu bar icon or the app
        menu.
      </p>
    </main>
  );
}
