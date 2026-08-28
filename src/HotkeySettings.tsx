import { useEffect, useState } from "react";
import { captureHotkeyFromEvent, type StoredHotkey } from "./hotkey/captureHotkey";
import KeyCaps from "./components/KeyCaps";

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
    <div className="card">
      <div className="row">
        <span className="row-label">Hold to dictate</span>
        {hotkey && !recording && <KeyCaps hotkey={hotkey} />}
        <button
          type="button"
          className="btn"
          onClick={() => {
            setError(null);
            setRecording(true);
          }}
          disabled={recording}
        >
          {recording ? "Press a key combo…" : "Change…"}
        </button>
      </div>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
