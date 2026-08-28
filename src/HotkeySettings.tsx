import { useEffect, useState } from "react";
import { captureHotkeyFromEvent, type StoredHotkey } from "./hotkey/captureHotkey";
import { formatHotkey } from "./hotkey/keycodeMap";

export default function HotkeySettings() {
  const [shortcut, setShortcut] = useState<StoredHotkey | null>(null);
  const [recording, setRecording] = useState(false);
  const [shortcutChangePending, setShortcutChangePending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.openstream.settings
      .get()
      .then((settings) => setShortcut(settings.hotkey))
      .catch(() => setError("Unable to load the Push-to-talk shortcut."));
  }, []);

  useEffect(() => {
    if (!recording) return;

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      const result = captureHotkeyFromEvent(event);
      if (!result.ok) {
        setError(result.reason);
        return;
      }

      setError(null);
      setRecording(false);
      setShortcutChangePending(true);
      window.openstream.settings
        .setShortcut(result.hotkey)
        .then((change) => {
          if (change.ok) {
            setShortcut(change.settings.hotkey);
            return;
          }
          setError(change.message);
        })
        .catch(() => setError("Unable to change the Push-to-talk shortcut."))
        .finally(() => setShortcutChangePending(false));
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  const buttonLabel = recording
    ? "Press a key combo…"
    : shortcutChangePending
      ? "Checking shortcut…"
      : "Change shortcut";

  return (
    <section className="setting">
      <h2>Push-to-talk shortcut</h2>
      <p className="setting-current">{shortcut ? formatHotkey(shortcut) : "Loading…"}</p>
      <p className="setting-guidance">
        OpenStream cannot reliably detect conflicts with macOS or other apps. If a shortcut does not work, choose another
        shortcut.
      </p>
      <button
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
        disabled={recording || shortcutChangePending}
      >
        {buttonLabel}
      </button>
      {error && <p className="setting-error">{error}</p>}
    </section>
  );
}
