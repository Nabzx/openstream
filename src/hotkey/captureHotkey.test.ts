import { describe, expect, it } from "vitest";
import { captureHotkeyFromEvent, type CapturedKeyEvent } from "./captureHotkey";
import { STANDALONE_OPTION_KEY_CODE } from "./keycodeMap";

function keyEvent(overrides: Partial<CapturedKeyEvent> & { code: string }): CapturedKeyEvent {
  return { metaKey: false, shiftKey: false, altKey: false, ctrlKey: false, ...overrides };
}

describe("captureHotkeyFromEvent", () => {
  it.each(["AltLeft", "AltRight"])("accepts standalone %s as Option", (code) => {
    const result = captureHotkeyFromEvent(keyEvent({ code, altKey: true }));
    expect(result).toEqual({ ok: true, hotkey: { keyCode: STANDALONE_OPTION_KEY_CODE, modifiers: [] } });
  });

  it.each([
    { code: "KeyD", ctrlKey: true },
    { code: "Digit1", metaKey: true },
    { code: "Period", altKey: true },
    { code: "KeyD" },
    { code: "ShiftLeft", shiftKey: true },
    { code: "ArrowUp", ctrlKey: true },
  ])("rejects unsupported input with the exact error", (event) => {
    expect(captureHotkeyFromEvent(keyEvent(event))).toEqual({ ok: false, reason: "Unsupported key" });
  });

  it("rejects Option when another modifier is held", () => {
    const result = captureHotkeyFromEvent(keyEvent({ code: "AltLeft", altKey: true, metaKey: true }));
    expect(result).toEqual({ ok: false, reason: "Unsupported key" });
  });
});
