import { useEffect, useState } from "react";
import { captureHotkeyFromEvent, type StoredHotkey } from "./hotkey/captureHotkey";
import { formatHotkey } from "./hotkey/keycodeMap";

export default function HotkeySettings() {
  const [hotkey, setHotkey] = useState<StoredHotkey | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.openstream.settings.get().then((settings) => setHotkey(settings.hotkey));
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
      window.openstream.settings.setHotkey(result.hotkey).then((settings) => setHotkey(settings.hotkey));
    }

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording]);

  return (
    <section className="setting">
      <h2>Push-to-talk hotkey</h2>
      <p className="setting-current">{hotkey ? formatHotkey(hotkey) : "Loading…"}</p>
      <button
        onClick={() => {
          setError(null);
          setRecording(true);
        }}
        disabled={recording}
      >
        {recording ? "Press a key combo…" : "Change hotkey"}
      </button>
      {error && <p className="setting-error">{error}</p>}
    </section>
  );
}
