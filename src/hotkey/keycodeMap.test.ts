import { describe, expect, it } from "vitest";
import { formatHotkey, labelForMacKeyCode, macKeyCodeForDomCode } from "./keycodeMap";

describe("macKeyCodeForDomCode", () => {
  it("maps a letter key to its macOS virtual keycode", () => {
    // keycode 2 is 'D' on the ANSI layout - matches hotkeyHelper.js's
    // default and native/hotkey-helper's own comment about it.
    expect(macKeyCodeForDomCode("KeyD")).toBe(2);
  });

  it("maps a digit key", () => {
    expect(macKeyCodeForDomCode("Digit1")).toBe(18);
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

  it("falls back to a numbered placeholder for an unmapped keycode", () => {
    expect(labelForMacKeyCode(999)).toBe("#999");
  });
});

describe("formatHotkey", () => {
  it("orders modifiers the way macOS itself does, regardless of input order", () => {
    expect(formatHotkey({ keyCode: 2, modifiers: ["cmd", "ctrl"] })).toBe("⌃⌘D");
  });

  it("formats the current default (Control+Option+D)", () => {
    expect(formatHotkey({ keyCode: 2, modifiers: ["ctrl", "alt"] })).toBe("⌃⌥D");
  });

  it("formats a single modifier", () => {
    expect(formatHotkey({ keyCode: 49, modifiers: ["cmd"] })).toBe("⌘Space");
  });
});
