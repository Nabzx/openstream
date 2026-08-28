import type { StoredHotkey } from "./hotkey/captureHotkey";

export type StoredSettings = {
  hotkey: StoredHotkey;
  breakSafeApps: string[];
  vocabularyProjectPath: string | null;
};

export type SetShortcutResult =
  | { ok: true; settings: StoredSettings }
  | { ok: false; kind: "unsupported" | "unavailable" | "internal-failure"; message: string };

export type ModelHealth = "ready" | "starting";

// #47. accessibility: granted | missing. inputMonitoring: granted | missing
// | unknown (IOHIDCheckAccess couldn't tell). microphone: granted | missing
// | pending (macOS will prompt on first capture).
export type GrantState = "granted" | "missing" | "unknown" | "pending";

export type PermissionKey = "accessibility" | "inputMonitoring" | "microphone";

export type PermissionVerdict = {
  ok: boolean;
  grants: Record<PermissionKey, GrantState>;
  blocking: PermissionKey[];
  warnings: PermissionKey[];
  details: { key: PermissionKey; label: string; state: GrantState; settingsUrl: string }[];
};

export type AppHealth = {
  permissions: Record<PermissionKey, GrantState>;
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
        checkPermissions(): Promise<PermissionVerdict>;
        openPrivacySettings(key: PermissionKey): Promise<void>;
      };
      settings: {
        get(): Promise<StoredSettings>;
        setShortcut(shortcut: StoredHotkey): Promise<SetShortcutResult>;
        setBreakSafeApps(apps: string[]): Promise<StoredSettings>;
        resetBreakSafeApps(): Promise<StoredSettings>;
        pickBreakSafeApp(): Promise<{ bundleId: string; name: string } | null>;
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
