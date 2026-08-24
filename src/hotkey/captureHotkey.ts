import { macKeyCodeForDomCode } from "./keycodeMap";

export type CapturedKeyEvent = {
  code: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
};

export type StoredHotkey = { keyCode: number; modifiers: string[] };

export type CaptureResult = { ok: true; hotkey: StoredHotkey } | { ok: false; reason: string };

// Kept separate from the DOM/React capture UI so the decision - which key
// events are acceptable as a global hotkey, and why one isn't - is testable
// without a browser. A component wires this to a real keydown listener.
export function captureHotkeyFromEvent(event: CapturedKeyEvent): CaptureResult {
  const keyCode = macKeyCodeForDomCode(event.code);
  if (keyCode === undefined) {
    return { ok: false, reason: `${event.code} can't be used as a hotkey - pick a letter, digit or punctuation key` };
  }

  const modifiers: string[] = [];
  if (event.ctrlKey) modifiers.push("ctrl");
  if (event.altKey) modifiers.push("alt");
  if (event.shiftKey) modifiers.push("shift");
  if (event.metaKey) modifiers.push("cmd");

  if (modifiers.length === 0) {
    // A bare key would fire the hotkey on every ordinary keystroke of it -
    // see settingsStore.js's validateHotkey, which enforces the same rule
    // server-side.
    return {
      ok: false,
      reason: "hold at least one modifier key (Control, Option, Shift or Command) together with the key",
    };
  }

  return { ok: true, hotkey: { keyCode, modifiers } };
}
