import type { StoredHotkey } from "./hotkey/captureHotkey";

export type StoredSettings = { hotkey: StoredHotkey; breakSafeApps: string[] };

// Exposed by preload.js via contextBridge - see the comment there for what
// this is expected to grow into.
declare global {
  interface Window {
    openstream: {
      settings: {
        get(): Promise<StoredSettings>;
        setHotkey(hotkey: StoredHotkey): Promise<StoredSettings>;
        setBreakSafeApps(apps: string[]): Promise<StoredSettings>;
      };
    };
  }
}
