import { isBreakSafeApplication } from "./breakSafety";
import { cleanupDictation } from "./cleanup";
import { applyParagraphBreaks, repairBreakIndices } from "./paragraphBreaks";
import type { CompletedRecording, DictationAdapters, DictationOutcome, FocusContext } from "./types";

export class DictationCoordinator {
  constructor(private readonly adapters: DictationAdapters) {}

  async completeRecording(recording: CompletedRecording): Promise<DictationOutcome> {
    if (recording.durationMs <= 0 || recording.wav.byteLength === 0) {
      this.adapters.setTrayState?.("idle");
      this.adapters.setOverlayState?.({ kind: "idle" });
      return { kind: "skipped", reason: "empty-recording" };
    }

    this.adapters.setTrayState?.("transcribing");
    this.adapters.setOverlayState?.({ kind: "transcribing" });

    let transcript: string;
    try {
      const result = await this.adapters.transcribe(recording);
      if (result.noSpeech || result.text.trim() === "") {
        this.adapters.setTrayState?.("idle");
        this.adapters.setOverlayState?.({ kind: "idle" });
        return { kind: "skipped", reason: "no-speech" };
      }
      transcript = result.text;
    } catch (error) {
      return this.fail(error, "transcription failed");
    }

    let context: FocusContext;
    try {
      context = await this.adapters.getFocusContext();
    } catch (error) {
      return this.fail(error, "focus context unavailable");
    }

    const breakSafe = isBreakSafeApplication(context.bundleId);
    const cleaned = cleanupDictation(transcript, { breakSafe, oneLine: context.isOneLineField });
    let finalText = cleaned.text;

    const eligibleForBreakPlacement =
      breakSafe && !context.isOneLineField && !cleaned.hasExplicitBreakCommand && cleaned.sentences.length >= 3;

    if (eligibleForBreakPlacement) {
      try {
        const reply = await this.adapters.placeParagraphBreaks(cleaned.sentences);
        const repair = repairBreakIndices(reply, cleaned.sentences.length);
        this.adapters.recordDiagnostic?.("paragraphBreaks.formatValid", repair.formatValid);
        this.adapters.recordDiagnostic?.("paragraphBreaks.dropped", repair.dropped);
        if (repair.indices.length > 0) {
          finalText = applyParagraphBreaks(cleaned.sentences, repair.indices);
        }
      } catch (error) {
        this.adapters.recordDiagnostic?.(
          "paragraphBreaks.failure",
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    let delivery;
    try {
      delivery = await this.adapters.deliver(finalText);
    } catch (error) {
      return this.fail(error, "delivery failed");
    }
    if (delivery.kind === "held") {
      this.adapters.setTrayState?.("held");
      this.adapters.setOverlayState?.({ kind: "held", text: finalText, reason: delivery.reason });
      return { kind: "held", text: finalText, reason: delivery.reason };
    }

    this.adapters.setTrayState?.("idle");
    this.adapters.setOverlayState?.({ kind: "idle" });
    return { kind: "inserted", text: finalText };
  }

  private fail(error: unknown, fallbackReason: string): DictationOutcome {
    const reason = error instanceof Error ? error.message : fallbackReason;
    this.adapters.setTrayState?.("failed");
    this.adapters.setOverlayState?.({ kind: "failed", reason });
    return { kind: "failed", reason };
  }
}
