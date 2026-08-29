import { useEffect, useState } from "react";
import { captureHotkeyFromEvent, type StoredHotkey } from "./hotkey/captureHotkey";
import { formatHotkey } from "./hotkey/keycodeMap";

export const SHORTCUT_CAPTURE_PROMPT = "Press Option, Command, Control, Fn, Caps Lock, or F1–F19…";
export const SHORTCUT_GUIDANCE =
  "F1–F12 require the top row to be in function-key mode. F13–F19 depend on keyboard support. Choose one standalone key: Option, Command, Control, Fn, or Caps Lock. OpenStream cannot reliably detect whether macOS or another app also uses a key. Fn and Caps Lock may not produce a usable event on every keyboard.";

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

    let captureOpen = true;

    function stopNativeCapture() {
      void window.openstream.settings.stopShortcutCapture().catch(() => {});
    }

    function applyShortcut(nextShortcut: StoredHotkey) {
      if (!captureOpen) return;
      captureOpen = false;
      stopNativeCapture();
      setError(null);
      setRecording(false);
      setShortcutChangePending(true);
      window.openstream.settings
        .setShortcut(nextShortcut)
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

    function onKeyDown(event: KeyboardEvent) {
      event.preventDefault();
      const result = captureHotkeyFromEvent(event);
      if (!result.ok) {
        setError(result.reason);
        return;
      }
      applyShortcut(result.hotkey);
    }

    // macOS exposes standalone Fn as a native modifier transition rather
    // than a reliable DOM keydown, so the main process captures it separately.
    const unsubscribe = window.openstream.settings.onShortcutCaptured(applyShortcut);
    window.addEventListener("keydown", onKeyDown, true);
    void window.openstream.settings.startShortcutCapture().catch(() => {});

    return () => {
      captureOpen = false;
      window.removeEventListener("keydown", onKeyDown, true);
      unsubscribe();
      stopNativeCapture();
    };
  }, [recording]);

  const buttonLabel = recording
    ? SHORTCUT_CAPTURE_PROMPT
    : shortcutChangePending
      ? "Checking shortcut…"
      : "Change shortcut";

  return (
    <section className="setting">
      <h2>Push-to-talk shortcut</h2>
      <p className="setting-current">{shortcut ? formatHotkey(shortcut) : "Loading…"}</p>
      <p className="setting-guidance">{SHORTCUT_GUIDANCE}</p>
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
