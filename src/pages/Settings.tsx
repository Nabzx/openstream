import { useEffect, useState } from "react";
import HotkeySettings from "../HotkeySettings";
import BreakSafeAppsSettings from "../BreakSafeAppsSettings";
import Toggle from "../components/Toggle";
import { ChevronDownIcon } from "../components/Icons";

function StartupSection() {
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.app.getLoginItem().then(setOpenAtLogin);
  }, []);

  return (
    <div className="group">
      <h2>
        Startup <span className="tag">Issue #135</span>
      </h2>
      <div className="card">
        <div className="row">
          <span className="row-label">Launch OpenStream at login</span>
          <Toggle
            label="Launch OpenStream at login"
            checked={openAtLogin ?? false}
            disabled={openAtLogin === null}
            onChange={(next) => {
              setOpenAtLogin(next);
              window.openstream.app.setLoginItem(next).then(setOpenAtLogin);
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MicrophoneSection() {
  // Device enumeration and selection is issue #137 - the section exists
  // so the layout is settled, but the control is inert for now.
  return (
    <div className="group">
      <h2>
        Microphone <span className="tag">Issue #137</span>
      </h2>
      <div className="card">
        <div className="row">
          <span className="row-label">Input device</span>
          <span className="select" aria-disabled="true" style={{ opacity: 0.5 }}>
            System Default
            <ChevronDownIcon />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Settings() {
  return (
    <main className="page">
      {/* HotkeySettings renders its own headed `.setting` section - it's
          kept as-is until the one-key shortcut work settles (#216), then restyled
          into the card system like the rest of this page. */}
      <HotkeySettings />

      <div className="group">
        <h2>Break-safe applications</h2>
        <p className="group-desc">
          A spoken “new paragraph” becomes a real line break only in the apps listed here. Everywhere else it is
          dropped, since a newline can submit a half-typed terminal command or send an unfinished message.
        </p>
        <BreakSafeAppsSettings />
      </div>

      <StartupSection />
      <MicrophoneSection />
    </main>
  );
}
