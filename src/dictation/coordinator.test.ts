import { describe, expect, it } from "vitest";
import { DictationCoordinator } from "./coordinator";
import type { CompletedRecording, DictationAdapters, FocusContext, OverlayState, TrayState } from "./types";

const recording: CompletedRecording = { wav: new Uint8Array([1, 2, 3]), durationMs: 1200 };

function makeAdapters(overrides: Partial<DictationAdapters> = {}) {
  const delivered: string[] = [];
  const tray: TrayState[] = [];
  const overlay: OverlayState[] = [];
  const breakCalls: string[][] = [];
  const diagnostics: Record<string, unknown[]> = {};
  const context: FocusContext = { bundleId: "com.apple.TextEdit", isOneLineField: false };

  const adapters: DictationAdapters = {
    async transcribe() {
      return { text: "hello world. this is second. this is third" };
    },
    async getFocusContext() {
      return context;
    },
    async placeParagraphBreaks(sentences) {
      breakCalls.push(sentences);
      return [3];
    },
    async deliver(text) {
      delivered.push(text);
      return { kind: "inserted" };
    },
    setTrayState(state) {
      tray.push(state);
    },
    setOverlayState(state) {
      overlay.push(state);
    },
    recordDiagnostic(name, value) {
      diagnostics[name] ??= [];
      diagnostics[name].push(value);
    },
    ...overrides,
  };

  return { adapters, delivered, tray, overlay, breakCalls, diagnostics, context };
}

describe("DictationCoordinator", () => {
  it("transcribes a whole completed recording, cleans it, places eligible paragraph breaks, and inserts once", async () => {
    const harness = makeAdapters();
    const coordinator = new DictationCoordinator(harness.adapters);

    coordinator.startRecording();
    const outcome = await coordinator.completeRecording(recording);

    expect(outcome).toEqual({
      kind: "inserted",
      text: "Hello world. This is second.\n\nThis is third.",
    });
    expect(harness.breakCalls).toEqual([["Hello world.", "This is second.", "This is third."]]);
    expect(harness.delivered).toEqual(["Hello world. This is second.\n\nThis is third."]);
    expect(harness.tray).toEqual(["recording", "transcribing", "idle"]);
    expect(harness.overlay).toEqual([
      { kind: "recording", level: 0 },
      { kind: "transcribing" },
      { kind: "idle" },
    ]);
  });

  it("skips break placement for short dictation", async () => {
    const harness = makeAdapters({
      async transcribe() {
        return { text: "hello world" };
      },
    });

    await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(harness.breakCalls).toEqual([]);
    expect(harness.delivered).toEqual(["Hello world."]);
  });

  it("skips break placement and removes line breaks in one-line fields", async () => {
    const harness = makeAdapters({
      async getFocusContext() {
        return { bundleId: "com.apple.TextEdit", isOneLineField: true };
      },
      async transcribe() {
        return { text: "first sentence. new paragraph second sentence" };
      },
    });

    await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(harness.breakCalls).toEqual([]);
    expect(harness.delivered).toEqual(["First sentence. Second sentence"]);
  });

  it("skips break placement for break-unsafe applications", async () => {
    const harness = makeAdapters({
      async getFocusContext() {
        return { bundleId: "com.apple.Terminal", isOneLineField: false };
      },
    });

    await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(harness.breakCalls).toEqual([]);
    expect(harness.delivered).toEqual(["Hello world. This is second. This is third."]);
  });

  it("skips empty recordings and no-speech transcriptions without insertion", async () => {
    const emptyHarness = makeAdapters();
    const empty = await new DictationCoordinator(emptyHarness.adapters).completeRecording({ wav: new Uint8Array(), durationMs: 0 });
    expect(empty).toEqual({ kind: "skipped", reason: "empty-recording" });
    expect(emptyHarness.delivered).toEqual([]);

    const noSpeechHarness = makeAdapters({
      async transcribe() {
        return { text: "", noSpeech: true };
      },
    });
    const noSpeech = await new DictationCoordinator(noSpeechHarness.adapters).completeRecording(recording);
    expect(noSpeech).toEqual({ kind: "skipped", reason: "no-speech" });
    expect(noSpeechHarness.delivered).toEqual([]);
  });

  it("does not insert partial output when transcription fails", async () => {
    const harness = makeAdapters({
      async transcribe() {
        throw new Error("server unavailable");
      },
    });

    const outcome = await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(outcome).toEqual({ kind: "failed", reason: "server unavailable" });
    expect(harness.delivered).toEqual([]);
    expect(harness.tray).toEqual(["transcribing", "failed"]);
  });

  it("repairs malformed break replies without retrying", async () => {
    const harness = makeAdapters({
      async placeParagraphBreaks(sentences) {
        harness.breakCalls.push(sentences);
        return { indices: [1, 3, 3, 99] };
      },
    });

    await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(harness.breakCalls).toHaveLength(1);
    expect(harness.delivered).toEqual(["Hello world. This is second.\n\nThis is third."]);
    expect(harness.diagnostics["paragraphBreaks.dropped"]).toEqual([[1, 3, 99]]);
  });

  it("degrades to rules-cleaned text when break placement fails", async () => {
    const harness = makeAdapters({
      async placeParagraphBreaks() {
        throw new Error("bad reply");
      },
    });

    await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(harness.delivered).toEqual(["Hello world. This is second. This is third."]);
  });

  it("holds the complete finished text when delivery cannot proceed", async () => {
    const harness = makeAdapters({
      async deliver(text) {
        harness.delivered.push(text);
        return { kind: "held", reason: "target changed" };
      },
    });

    const outcome = await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(outcome).toEqual({
      kind: "held",
      text: "Hello world. This is second.\n\nThis is third.",
      reason: "target changed",
    });
    expect(harness.overlay.at(-1)).toEqual({
      kind: "held",
      text: "Hello world. This is second.\n\nThis is third.",
      reason: "target changed",
    });
  });

  it("reports delivery failures without retrying insertion", async () => {
    const harness = makeAdapters({
      async deliver() {
        throw new Error("accessibility helper timed out");
      },
    });

    const outcome = await new DictationCoordinator(harness.adapters).completeRecording(recording);

    expect(outcome).toEqual({ kind: "failed", reason: "accessibility helper timed out" });
    expect(harness.tray).toEqual(["transcribing", "failed"]);
    expect(harness.overlay.at(-1)).toEqual({ kind: "failed", reason: "accessibility helper timed out" });
  });
});
