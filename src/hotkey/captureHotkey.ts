import {
  isStandaloneKeyCode,
  macKeyCodeForDomCode,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_OPTION_KEY_CODE,
} from "./keycodeMap";

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

function hasAdditionalModifier(event: CapturedKeyEvent, keyCode: number): boolean {
  if (keyCode === STANDALONE_OPTION_KEY_CODE) return event.metaKey || event.shiftKey || event.ctrlKey;
  if (keyCode === STANDALONE_COMMAND_KEY_CODE) return event.altKey || event.shiftKey || event.ctrlKey;
  if (keyCode === STANDALONE_CONTROL_KEY_CODE) return event.altKey || event.shiftKey || event.metaKey;
  return event.metaKey || event.shiftKey || event.altKey || event.ctrlKey;
}

// Kept separate from the DOM/React capture UI so the decision - which key
// events are acceptable as a global hotkey, and why one isn't - is testable
// without a browser. The component wires ordinary candidates to keydown;
// standalone Fn is captured through the native helper because macOS does not
// reliably expose it to the DOM.
export function captureHotkeyFromEvent(event: CapturedKeyEvent): CaptureResult {
  const keyCode = macKeyCodeForDomCode(event.code);
  if (keyCode === undefined || !isStandaloneKeyCode(keyCode) || hasAdditionalModifier(event, keyCode)) {
    return { ok: false, reason: UNSUPPORTED_KEY };
  }

  return { ok: true, hotkey: { keyCode, modifiers: [] } };
}
