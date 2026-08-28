import { describe, expect, it } from "vitest";
import { captureHotkeyFromEvent, type CapturedKeyEvent } from "./captureHotkey";
import {
  STANDALONE_CAPS_LOCK_KEY_CODE,
  STANDALONE_COMMAND_KEY_CODE,
  STANDALONE_CONTROL_KEY_CODE,
  STANDALONE_FN_KEY_CODE,
  STANDALONE_OPTION_KEY_CODE,
} from "./keycodeMap";

function keyEvent(overrides: Partial<CapturedKeyEvent> & { code: string }): CapturedKeyEvent {
  return { metaKey: false, shiftKey: false, altKey: false, ctrlKey: false, ...overrides };
}

describe("captureHotkeyFromEvent", () => {
  it.each([
    ["AltLeft", STANDALONE_OPTION_KEY_CODE, { altKey: true }],
    ["AltRight", STANDALONE_OPTION_KEY_CODE, { altKey: true }],
    ["MetaLeft", STANDALONE_COMMAND_KEY_CODE, { metaKey: true }],
    ["MetaRight", STANDALONE_COMMAND_KEY_CODE, { metaKey: true }],
    ["ControlLeft", STANDALONE_CONTROL_KEY_CODE, { ctrlKey: true }],
    ["ControlRight", STANDALONE_CONTROL_KEY_CODE, { ctrlKey: true }],
    ["Fn", STANDALONE_FN_KEY_CODE, {}],
    ["CapsLock", STANDALONE_CAPS_LOCK_KEY_CODE, {}],
  ])("accepts standalone %s", (code, keyCode, modifiers) => {
    const result = captureHotkeyFromEvent(keyEvent({ code, ...modifiers }));
    expect(result).toEqual({ ok: true, hotkey: { keyCode, modifiers: [] } });
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
  ])("accepts %s without modifiers", (code, keyCode) => {
    expect(captureHotkeyFromEvent(keyEvent({ code }))).toEqual({
      ok: true,
      hotkey: { keyCode, modifiers: [] },
    });
  });

  it.each([
    { code: "KeyD", ctrlKey: true },
    { code: "Digit1", metaKey: true },
    { code: "Period", altKey: true },
    { code: "F1", altKey: true },
    { code: "KeyD" },
    { code: "ShiftLeft", shiftKey: true },
    { code: "ArrowUp", ctrlKey: true },
    { code: "MetaLeft", metaKey: true, shiftKey: true },
    { code: "ControlLeft", ctrlKey: true, altKey: true },
    { code: "Fn", metaKey: true },
    { code: "CapsLock", ctrlKey: true },
  ])("rejects unsupported input with the exact error", (event) => {
    expect(captureHotkeyFromEvent(keyEvent(event))).toEqual({ ok: false, reason: "Unsupported key" });
  });

  it.each([
    { code: "AltLeft", altKey: true, metaKey: true },
    { code: "MetaLeft", metaKey: true, ctrlKey: true },
    { code: "ControlLeft", ctrlKey: true, shiftKey: true },
    { code: "Fn", altKey: true },
    { code: "CapsLock", shiftKey: true },
  ])("rejects %s when another modifier is held", (event) => {
    expect(captureHotkeyFromEvent(keyEvent(event))).toEqual({ ok: false, reason: "Unsupported key" });
  });
});
