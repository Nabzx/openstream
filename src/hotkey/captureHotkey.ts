import { macKeyCodeForDomCode, STANDALONE_OPTION_KEY_CODE } from "./keycodeMap";

export type CapturedKeyEvent = {
  code: string;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
};

export type StoredHotkey = { keyCode: number; modifiers: string[] };

export type CaptureResult = { ok: true; hotkey: StoredHotkey } | { ok: false; reason: string };

const UNSUPPORTED_KEY = "Unsupported key";
const STANDALONE_OPTION_CODES = new Set(["AltLeft", "AltRight"]);

// Kept separate from the DOM/React capture UI so the decision - which key
// events are acceptable as a global hotkey, and why one isn't - is testable
// without a browser. A component wires this to a real keydown listener.
export function captureHotkeyFromEvent(event: CapturedKeyEvent): CaptureResult {
  const keyCode = macKeyCodeForDomCode(event.code);
  const isStandaloneOption =
    keyCode === STANDALONE_OPTION_KEY_CODE &&
    STANDALONE_OPTION_CODES.has(event.code) &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.metaKey;

  if (!isStandaloneOption) return { ok: false, reason: UNSUPPORTED_KEY };

  return { ok: true, hotkey: { keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] } };
}
