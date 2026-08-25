import { describe, expect, it } from "vitest";
import { captureHotkeyFromEvent, type CapturedKeyEvent } from "./captureHotkey";

function keyEvent(overrides: Partial<CapturedKeyEvent> & { code: string }): CapturedKeyEvent {
  return { metaKey: false, shiftKey: false, altKey: false, ctrlKey: false, ...overrides };
}

describe("captureHotkeyFromEvent", () => {
  it("accepts a letter held with one modifier", () => {
    const result = captureHotkeyFromEvent(keyEvent({ code: "KeyD", ctrlKey: true }));
    expect(result).toEqual({ ok: true, hotkey: { keyCode: 2, modifiers: ["ctrl"] } });
  });

  it("collects every held modifier, in event-property order", () => {
    const result = captureHotkeyFromEvent(
      keyEvent({ code: "KeyD", ctrlKey: true, altKey: true, shiftKey: true, metaKey: true })
    );
    expect(result).toEqual({ ok: true, hotkey: { keyCode: 2, modifiers: ["ctrl", "alt", "shift", "cmd"] } });
  });

  it("rejects a key with no modifier held", () => {
    const result = captureHotkeyFromEvent(keyEvent({ code: "KeyD" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/at least one modifier/);
  });

  it("rejects a key outside the mapped range", () => {
    const result = captureHotkeyFromEvent(keyEvent({ code: "ArrowUp", ctrlKey: true }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/ArrowUp/);
  });

  it("accepts a digit with the Command modifier", () => {
    const result = captureHotkeyFromEvent(keyEvent({ code: "Digit1", metaKey: true }));
    expect(result).toEqual({ ok: true, hotkey: { keyCode: 18, modifiers: ["cmd"] } });
  });
});
