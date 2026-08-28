// macOS virtual keycodes (Carbon Events.h kVK_*) keyed by the DOM
// KeyboardEvent.code values a renderer can actually observe. Legacy
// combinations still use the ANSI character mappings; new captures use
// supported standalone triggers.
export const STANDALONE_OPTION_KEY_CODE = 58;
export const STANDALONE_COMMAND_KEY_CODE = 55;
export const STANDALONE_CONTROL_KEY_CODE = 59;
export const STANDALONE_FN_KEY_CODE = 63;
export const STANDALONE_CAPS_LOCK_KEY_CODE = 57;

export const FUNCTION_KEY_CODES: Record<string, number> = {
  F1: 122,
  F2: 120,
  F3: 99,
  F4: 118,
  F5: 96,
  F6: 97,
  F7: 98,
  F8: 100,
  F9: 101,
  F10: 109,
  F11: 103,
  F12: 111,
  F13: 105,
  F14: 107,
  F15: 113,
  F16: 106,
  F17: 64,
  F18: 79,
  F19: 80,
};

const STANDALONE_KEY_CODES = new Set([
  STANDALONE_OPTION_KEY_CODE,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_FN_KEY_CODE,
  STANDALONE_CAPS_LOCK_KEY_CODE,
  ...Object.values(FUNCTION_KEY_CODES),
]);

export function isStandaloneKeyCode(keyCode: number | undefined): boolean {
  return keyCode !== undefined && STANDALONE_KEY_CODES.has(keyCode);
}

export const DOM_CODE_TO_MAC_KEYCODE: Record<string, number> = {
  KeyA: 0, KeyB: 11, KeyC: 8, KeyD: 2, KeyE: 14, KeyF: 3, KeyG: 5, KeyH: 4,
  KeyI: 34, KeyJ: 38, KeyK: 40, KeyL: 37, KeyM: 46, KeyN: 45, KeyO: 31,
  KeyP: 35, KeyQ: 12, KeyR: 15, KeyS: 1, KeyT: 17, KeyU: 32, KeyV: 9,
  KeyW: 13, KeyX: 7, KeyY: 16, KeyZ: 6,
  Digit0: 29, Digit1: 18, Digit2: 19, Digit3: 20, Digit4: 21, Digit5: 23,
  Digit6: 22, Digit7: 26, Digit8: 28, Digit9: 25,
  Minus: 27, Equal: 24, BracketLeft: 33, BracketRight: 30, Backslash: 42,
  Semicolon: 41, Quote: 39, Comma: 43, Period: 47, Slash: 44, Backquote: 50,
  Space: 49, Tab: 48,
  // Physical modifier sides share one logical identity for new captures.
  AltLeft: STANDALONE_OPTION_KEY_CODE, AltRight: STANDALONE_OPTION_KEY_CODE,
  MetaLeft: STANDALONE_COMMAND_KEY_CODE, MetaRight: STANDALONE_COMMAND_KEY_CODE,
  ControlLeft: STANDALONE_CONTROL_KEY_CODE, ControlRight: STANDALONE_CONTROL_KEY_CODE,
  Fn: STANDALONE_FN_KEY_CODE,
  CapsLock: STANDALONE_CAPS_LOCK_KEY_CODE,
  ...FUNCTION_KEY_CODES,
};

const SYMBOL_LABELS: Record<string, string> = {
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  Space: "Space", Tab: "Tab",
  AltLeft: "Option", AltRight: "Option",
  MetaLeft: "Command", MetaRight: "Command",
  ControlLeft: "Control", ControlRight: "Control",
  Fn: "Fn",
  CapsLock: "Caps Lock",
};

function labelForDomCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return SYMBOL_LABELS[code] ?? code;
}

const MAC_KEYCODE_TO_LABEL: Record<number, string> = Object.fromEntries(
  Object.entries(DOM_CODE_TO_MAC_KEYCODE).map(([code, keyCode]) => [keyCode, labelForDomCode(code)])
);

export function macKeyCodeForDomCode(code: string): number | undefined {
  return DOM_CODE_TO_MAC_KEYCODE[code];
}

export function labelForMacKeyCode(keyCode: number): string {
  return MAC_KEYCODE_TO_LABEL[keyCode] ?? `#${keyCode}`;
}

// macOS's own on-screen modifier ordering convention (System Settings >
// Keyboard Shortcuts and menu key-equivalents both use this order).
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "cmd"] as const;
const MODIFIER_SYMBOLS: Record<string, string> = {
  ctrl: "⌃", alt: "⌥", shift: "⇧", cmd: "⌘",
};

// Each key of the combo as its own symbol, modifiers in macOS order:
// ["⌃", "⌥", "D"]. formatHotkey joins these; the Home page renders them
// as separate keycaps.
export function hotkeyParts(hotkey: { keyCode: number; modifiers: string[] }): string[] {
  const symbols = MODIFIER_ORDER.filter((modifier) => hotkey.modifiers.includes(modifier)).map(
    (modifier) => MODIFIER_SYMBOLS[modifier]
  );
  return [...symbols, labelForMacKeyCode(hotkey.keyCode)];
}

export function formatHotkey(hotkey: { keyCode: number; modifiers: string[] }): string {
  return hotkeyParts(hotkey).join("");
}
