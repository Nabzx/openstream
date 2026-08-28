import { useCallback, useEffect, useState } from "react";
import type { GrantState, PermissionVerdict } from "../openstreamBridge";
import StatusPill, { type PillTone } from "../components/StatusPill";
import { InputMonitorIcon, MicIcon, ShieldIcon } from "../components/Icons";

const ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  accessibility: ShieldIcon,
  inputMonitoring: InputMonitorIcon,
  microphone: MicIcon,
};

const EXPLAIN: Record<string, string> = {
  accessibility: "Lets OpenStream place text at the cursor.",
  inputMonitoring: "Lets the push-to-talk shortcut work in every app.",
  microphone: "Lets OpenStream hear you. macOS prompts for this the first time you dictate.",
};

function pill(state: GrantState): { tone: PillTone; label: string } {
  switch (state) {
    case "granted":
      return { tone: "ok", label: "Granted" };
    case "missing":
      return { tone: "err", label: "Not granted" };
    case "pending":
      return { tone: "wait", label: "Not asked yet" };
    default:
      return { tone: "muted", label: "Can't tell" };
  }
}

export default function Permissions({ onDone }: { onDone: () => void }) {
  const [verdict, setVerdict] = useState<PermissionVerdict | null>(null);
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(() => {
    setChecking(true);
    window.openstream.app
      .checkPermissions()
      .then(setVerdict)
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    recheck();
  }, [recheck]);

  return (
    <main className="page">
      <div className="hero">
        <div>
          <h1>Permissions</h1>
          <p>
            OpenStream needs two macOS permissions to work. Because it runs from source, a rebuild resets them — if a
            grant looks stuck, <b>remove the old OpenStream entry in System Settings first, then add it again</b>.
          </p>
        </div>
      </div>

      <div className="card">
        {(verdict?.details ?? []).map((row) => {
          const Icon = ICONS[row.key];
          const p = pill(row.state);
          return (
            <div className="row" key={row.key}>
              {Icon && <Icon className="row-icon" />}
              <span className="row-label">
                {row.label}
                <small>{EXPLAIN[row.key]}</small>
              </span>
              <StatusPill tone={p.tone} label={p.label} />
              {row.state !== "granted" && row.key !== "microphone" && (
                <button
                  type="button"
                  className="btn"
                  style={{ marginLeft: 8 }}
                  onClick={() => window.openstream.app.openPrivacySettings(row.key)}
                >
                  Open Settings
                </button>
              )}
            </div>
          );
        })}
        {!verdict && (
          <div className="row">
            <span className="row-label">Checking…</span>
          </div>
        )}
      </div>

      <div className="row" style={{ padding: "0 2px", gap: 8 }}>
        <button type="button" className="btn" onClick={recheck} disabled={checking}>
          {checking ? "Re-checking…" : "Re-check"}
        </button>
        {verdict?.ok && (
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Done
          </button>
        )}
      </div>
    </main>
  );
}
