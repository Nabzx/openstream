export type TrayState = "idle" | "recording" | "transcribing" | "held" | "failed";

export type OverlayState =
  | { kind: "idle" }
  | { kind: "recording"; level: number }
  | { kind: "transcribing" }
  | { kind: "held"; text: string; reason: string }
  | { kind: "failed"; reason: string };

export type FocusContext = {
  bundleId: string;
  isOneLineField: boolean;
};

export type CompletedRecording = {
  wav: Uint8Array;
  durationMs: number;
  peakLevel?: number;
};

export type TranscriptionResult = {
  text: string;
  noSpeech?: boolean;
};

export type DeliveryResult =
  | { kind: "inserted" }
  | { kind: "held"; reason: string };

export type ParagraphBreakPlacement =
  | { breakBeforeSentenceNumbers: number[] }
  | { breakBefore: number[] }
  | { breaks: number[] }
  | { indices: number[] }
  | number[]
  | string;

export type DictationAdapters = {
  transcribe(recording: CompletedRecording): Promise<TranscriptionResult>;
  getFocusContext(): Promise<FocusContext>;
  placeParagraphBreaks(sentences: string[]): Promise<ParagraphBreakPlacement>;
  deliver(text: string): Promise<DeliveryResult>;
  setTrayState?(state: TrayState): void;
  setOverlayState?(state: OverlayState): void;
  recordDiagnostic?(name: string, value: unknown): void;
};

export type DictationOutcome =
  | { kind: "inserted"; text: string }
  | { kind: "held"; text: string; reason: string }
  | { kind: "skipped"; reason: "empty-recording" | "no-speech" }
  | { kind: "failed"; reason: string };
