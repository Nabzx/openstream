import { describe, expect, it } from "vitest";
import {
  formatHotkey,
  hotkeyParts,
  labelForMacKeyCode,
  macKeyCodeForDomCode,
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

  it("maps either physical Option key to one logical identity", () => {
    expect(macKeyCodeForDomCode("AltLeft")).toBe(STANDALONE_OPTION_KEY_CODE);
    expect(macKeyCodeForDomCode("AltRight")).toBe(STANDALONE_OPTION_KEY_CODE);
  });

  it("returns undefined for an unmapped key", () => {
    expect(macKeyCodeForDomCode("ArrowUp")).toBeUndefined();
    expect(macKeyCodeForDomCode("F1")).toBeUndefined();
  });
});

describe("labelForMacKeyCode", () => {
  it("round-trips a mapped keycode back to its letter", () => {
    expect(labelForMacKeyCode(2)).toBe("D");
  });

  it("labels the standalone Option identity", () => {
    expect(labelForMacKeyCode(STANDALONE_OPTION_KEY_CODE)).toBe("Option");
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

  it("formats standalone Option with its human-readable name", () => {
    expect(formatHotkey({ keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] })).toBe("Option");
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
