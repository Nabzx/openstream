import { useCallback, useEffect, useState } from "react";
import type { GrantState, PermissionVerdict } from "../openstreamBridge";
import Mark from "../components/Mark";
import StatusPill, { type PillTone } from "../components/StatusPill";
import { InputMonitorIcon, MicIcon, ShieldIcon } from "../components/Icons";

const ICONS: Record<string, (props: { className?: string }) => JSX.Element> = {
  accessibility: ShieldIcon,
  inputMonitoring: InputMonitorIcon,
  microphone: MicIcon,
};

const EXPLAIN: Record<string, string> = {
  accessibility: "Lets OpenStream place your words at the cursor.",
  inputMonitoring: "Lets the push-to-talk shortcut work in every app.",
  microphone: "Lets OpenStream hear you. macOS asks the first time you dictate.",
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

  const details = verdict?.details ?? [];
  const required = details.filter((row) => row.key !== "microphone");
  const grantedRequired = required.filter((row) => row.state === "granted").length;

  return (
    <main className="page">
      <div className="hero">
        <Mark tile state={verdict && !verdict.ok ? "attention" : "idle"} />
        <div>
          <h1>{verdict?.ok ? "OpenStream is ready" : "Grant two permissions"}</h1>
          <p>
            OpenStream places text at your cursor and listens for the shortcut. macOS gates both behind a switch you
            flip once.
          </p>
        </div>
      </div>

      {verdict && !verdict.ok && (
        <p className="perm-progress">
          {grantedRequired} of {required.length} required permissions granted
        </p>
      )}

      <div className="perm-list">
        {details.map((row) => {
          const Icon = ICONS[row.key];
          const p = pill(row.state);
          const optional = row.key === "microphone";
          return (
            <div className="perm-item" data-granted={row.state === "granted"} key={row.key}>
              <span className="perm-item__icon">{Icon && <Icon />}</span>
              <div className="perm-item__body">
                <div className="perm-item__title">
                  {row.label}
                  {optional && <span className="tag">Optional now</span>}
                </div>
                <p className="perm-item__why">{EXPLAIN[row.key]}</p>
              </div>
              <div className="perm-item__action">
                <StatusPill tone={p.tone} label={p.label} />
                {row.state !== "granted" && !optional && (
                  <button
                    type="button"
                    className="btn btn--primary"
                    onClick={() => window.openstream.app.openPrivacySettings(row.key)}
                  >
                    Open Settings
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {!verdict && (
          <div className="perm-item">
            <div className="perm-item__body">
              <div className="perm-item__title">Checking…</div>
            </div>
          </div>
        )}
      </div>

      <div className="perm-footer">
        <button type="button" className="btn" onClick={recheck} disabled={checking}>
          {checking ? "Re-checking…" : "Re-check"}
        </button>
        {verdict?.ok && (
          <button type="button" className="btn btn--primary" onClick={onDone}>
            Continue
          </button>
        )}
      </div>

      <p className="hint">
        After granting, quit and reopen OpenStream so it picks up the change. Because OpenStream runs from source, a
        rebuild resets these — if a switch looks stuck, remove the old OpenStream entry in System Settings first, then
        add it again.
      </p>
    </main>
  );
}
