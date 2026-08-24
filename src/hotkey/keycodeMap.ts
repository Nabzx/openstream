// macOS virtual keycodes (Carbon Events.h kVK_ANSI_*) for the US ANSI
// layout, keyed by the DOM KeyboardEvent.code values a renderer can
// actually observe. Covers letters, digits and the punctuation keys next
// to them - the plausible range for a dictation hotkey. Arrow, function
// and other unmapped keys are rejected by captureHotkey.ts rather than
// guessed at here.
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
};

const SYMBOL_LABELS: Record<string, string> = {
  Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]", Backslash: "\\",
  Semicolon: ";", Quote: "'", Comma: ",", Period: ".", Slash: "/", Backquote: "`",
  Space: "Space", Tab: "Tab",
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

export function formatHotkey(hotkey: { keyCode: number; modifiers: string[] }): string {
  const symbols = MODIFIER_ORDER.filter((modifier) => hotkey.modifiers.includes(modifier)).map(
    (modifier) => MODIFIER_SYMBOLS[modifier]
  );
  return [...symbols, labelForMacKeyCode(hotkey.keyCode)].join("");
}
