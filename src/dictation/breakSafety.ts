const BREAK_SAFE_BUNDLE_IDS = new Set([
  "com.apple.TextEdit",
  "com.apple.Notes",
  "md.obsidian",
  "com.microsoft.VSCode",
]);

export function isBreakSafeApplication(bundleId: string): boolean {
  return BREAK_SAFE_BUNDLE_IDS.has(bundleId);
}

export function breakSafeBundleIds(): string[] {
  return [...BREAK_SAFE_BUNDLE_IDS];
}
