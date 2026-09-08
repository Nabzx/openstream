import { useEffect, useState } from "react";
import HotkeySettings from "../HotkeySettings";
import BreakSafeAppsSettings from "../BreakSafeAppsSettings";
import TermCorrectionsSettings from "../TermCorrectionsSettings";
import Toggle from "../components/Toggle";

function CopyTranscriptSection() {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setEnabled(settings.copyTranscriptToClipboard));
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Copy every dictation</h3>
      <p className="setting-item__desc">
        Also puts the finished text on the clipboard, so a paste that doesn’t land is never lost. Off by default,
        since it replaces whatever you had copied.
      </p>
      <div className="setting-item__control">
        <Toggle
          label="Copy each finished dictation to the clipboard"
          checked={enabled ?? false}
          disabled={enabled === null}
          onChange={(next) => {
            setEnabled(next);
            window.openstream.settings
              .setCopyTranscript(next)
              .then((settings) => setEnabled(settings.copyTranscriptToClipboard));
          }}
        />
      </div>
    </div>
  );
}

function StartupSection() {
  const [openAtLogin, setOpenAtLogin] = useState<boolean | null>(null);

  useEffect(() => {
    window.openstream.app.getLoginItem().then(setOpenAtLogin);
  }, []);

  return (
    <div className="setting-item">
      <h3 className="setting-item__name">Launch at login</h3>
      <p className="setting-item__desc">Starts quietly in the menu bar, no window.</p>
      <div className="setting-item__control">
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
  );
}

export default function Settings() {
  return (
    <main className="page">
      <div className="settings-list">
        {/* HotkeySettings renders its own `.setting` section - owned by the
            one-key shortcut work (#216). index.css matches it to the
            `.setting-item` pattern with `order`, CSS only. */}
        <HotkeySettings />

        <div className="setting-item">
          <h3 className="setting-item__name">Line breaks by app</h3>
          <p className="setting-item__desc">
            A spoken “new paragraph” becomes a real line break only in these apps. Everywhere else it is dropped,
            since a newline can submit a half-typed terminal command or send an unfinished message.
          </p>
          <BreakSafeAppsSettings />
        </div>

        <div className="setting-item">
          <h3 className="setting-item__name">Names &amp; terms</h3>
          <p className="setting-item__desc">
            Fix a name or a project term the transcription keeps getting wrong. Each entry rewrites a word or
            phrase wherever it is heard, whatever the capitalisation.
          </p>
          <TermCorrectionsSettings />
        </div>

        <CopyTranscriptSection />

        <StartupSection />
      </div>
    </main>
  );
}
