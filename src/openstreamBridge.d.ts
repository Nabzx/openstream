import type { StoredHotkey } from "./hotkey/captureHotkey";

export type StoredSettings = {
  hotkey: StoredHotkey;
  breakSafeApps: string[];
  vocabularyProjectPath: string | null;
};

export type SetShortcutResult =
  | { ok: true; settings: StoredSettings }
  | { ok: false; kind: "unsupported" | "unavailable" | "internal-failure"; message: string };

export type MediaAccessStatus = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
export type ModelHealth = "ready" | "starting";

export type AppHealth = {
  accessibility: boolean;
  microphone: MediaAccessStatus;
  inputMonitoring: "unknown";
  transcriptionModel: ModelHealth;
  rewriteModel: ModelHealth;
};

export type VocabularyStatus = {
  path: string | null;
  termCount: number;
  filesRead: number;
  // Electron's IPC uses the structured clone algorithm, which preserves
  // Date instances - this arrives as a real Date, not a serialized string.
  scannedAt: Date | null;
};

// Exposed by preload.js via contextBridge - see the comment there for what
// this is expected to grow into.
declare global {
  interface Window {
    openstream: {
      app: {
        getHealth(): Promise<AppHealth>;
        getLoginItem(): Promise<boolean>;
        setLoginItem(enabled: boolean): Promise<boolean>;
      };
      settings: {
        get(): Promise<StoredSettings>;
        setShortcut(shortcut: StoredHotkey): Promise<SetShortcutResult>;
        setBreakSafeApps(apps: string[]): Promise<StoredSettings>;
        setVocabularyProjectPath(
          projectPath: string | null
        ): Promise<{ settings: StoredSettings; status: VocabularyStatus }>;
      };
      vocabulary: {
        rescan(): Promise<VocabularyStatus>;
        getStatus(): Promise<VocabularyStatus>;
        chooseFolder(): Promise<string | null>;
      };
      onNavigate(callback: (page: string) => void): () => void;
    };
  }
}
