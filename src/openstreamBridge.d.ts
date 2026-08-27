import type { StoredHotkey } from "./hotkey/captureHotkey";

export type StoredSettings = {
  hotkey: StoredHotkey;
  breakSafeApps: string[];
  vocabularyProjectPath: string | null;
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
      settings: {
        get(): Promise<StoredSettings>;
        setHotkey(hotkey: StoredHotkey): Promise<StoredSettings>;
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
    };
  }
}
