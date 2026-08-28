import { describe, expect, it } from "vitest";
import {
  formatHotkey,
  hotkeyParts,
  labelForMacKeyCode,
  macKeyCodeForDomCode,
  STANDALONE_CAPS_LOCK_KEY_CODE,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_FN_KEY_CODE,
  STANDALONE_OPTION_KEY_CODE,
} from "./keycodeMap";

describe("macKeyCodeForDomCode", () => {
  it("maps a letter key to its macOS virtual keycode", () => {
    // keycode 2 is 'D' on the ANSI layout - matches hotkeyHelper.js's
    // default and native/hotkey-helper's own comment about it.
    expect(macKeyCodeForDomCode("KeyD")).toBe(2);
  });

  it("maps a digit key", () => {
    expect(macKeyCodeForDomCode("Digit1")).toBe(18);
  });

  it.each([
    ["F1", 122],
    ["F2", 120],
    ["F3", 99],
    ["F4", 118],
    ["F5", 96],
    ["F6", 97],
    ["F7", 98],
    ["F8", 100],
    ["F9", 101],
    ["F10", 109],
    ["F11", 103],
    ["F12", 111],
    ["F13", 105],
    ["F14", 107],
    ["F15", 113],
    ["F16", 106],
    ["F17", 64],
    ["F18", 79],
    ["F19", 80],
  ])("maps %s to its macOS virtual keycode", (code, keyCode) => {
    expect(macKeyCodeForDomCode(code)).toBe(keyCode);
  });

  it("maps either physical Option key to one logical identity", () => {
    expect(macKeyCodeForDomCode("AltLeft")).toBe(STANDALONE_OPTION_KEY_CODE);
    expect(macKeyCodeForDomCode("AltRight")).toBe(STANDALONE_OPTION_KEY_CODE);
  });

  it.each([
    ["MetaLeft", STANDALONE_COMMAND_KEY_CODE],
    ["MetaRight", STANDALONE_COMMAND_KEY_CODE],
    ["ControlLeft", STANDALONE_CONTROL_KEY_CODE],
    ["ControlRight", STANDALONE_CONTROL_KEY_CODE],
    ["Fn", STANDALONE_FN_KEY_CODE],
    ["CapsLock", STANDALONE_CAPS_LOCK_KEY_CODE],
  ])("maps %s to its logical standalone identity", (code, keyCode) => {
    expect(macKeyCodeForDomCode(code)).toBe(keyCode);
  });

  it("returns undefined for an unmapped key", () => {
    expect(macKeyCodeForDomCode("ArrowUp")).toBeUndefined();
  });
});

describe("labelForMacKeyCode", () => {
  it("round-trips a mapped keycode back to its letter", () => {
    expect(labelForMacKeyCode(2)).toBe("D");
  });

  it.each([
    [STANDALONE_OPTION_KEY_CODE, "Option"],
    [STANDALONE_COMMAND_KEY_CODE, "Command"],
    [STANDALONE_CONTROL_KEY_CODE, "Control"],
    [STANDALONE_FN_KEY_CODE, "Fn"],
    [STANDALONE_CAPS_LOCK_KEY_CODE, "Caps Lock"],
  ])("labels standalone keycode %s", (keyCode, label) => {
    expect(labelForMacKeyCode(keyCode)).toBe(label);
  });

  it("labels a function key by its familiar name", () => {
    expect(labelForMacKeyCode(80)).toBe("F19");
  });

  it("falls back to a numbered placeholder for an unmapped keycode", () => {
    expect(labelForMacKeyCode(999)).toBe("#999");
  });
});

describe("formatHotkey", () => {
  it("orders modifiers the way macOS itself does, regardless of input order", () => {
    expect(formatHotkey({ keyCode: 2, modifiers: ["cmd", "ctrl"] })).toBe("⌃⌘D");
  });

  it("formats a legacy Control+Option+D combination", () => {
    expect(formatHotkey({ keyCode: 2, modifiers: ["ctrl", "alt"] })).toBe("⌃⌥D");
  });

  it("formats a single modifier", () => {
    expect(formatHotkey({ keyCode: 49, modifiers: ["cmd"] })).toBe("⌘Space");
  });

  it.each([
    [STANDALONE_OPTION_KEY_CODE, "Option"],
    [STANDALONE_COMMAND_KEY_CODE, "Command"],
    [STANDALONE_CONTROL_KEY_CODE, "Control"],
    [STANDALONE_FN_KEY_CODE, "Fn"],
    [STANDALONE_CAPS_LOCK_KEY_CODE, "Caps Lock"],
  ])("formats standalone keycode %s without modifiers", (keyCode, label) => {
    expect(formatHotkey({ keyCode, modifiers: [] })).toBe(label);
  });

  it("formats a function key with its familiar name", () => {
    expect(formatHotkey({ keyCode: 122, modifiers: [] })).toBe("F1");
  });
});

describe("hotkeyParts", () => {
  it("splits a combo into one entry per key, modifiers in macOS order", () => {
    expect(hotkeyParts({ keyCode: 2, modifiers: ["alt", "ctrl"] })).toEqual(["⌃", "⌥", "D"]);
  });

  it("is the same sequence formatHotkey joins", () => {
    const hotkey = { keyCode: 2, modifiers: ["ctrl", "alt"] };
    expect(hotkeyParts(hotkey).join("")).toBe(formatHotkey(hotkey));
  });
});
