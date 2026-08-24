const BREAK_SAFE_BUNDLE_IDS = new Set([
  "com.apple.TextEdit",
  "com.apple.Notes",
  "md.obsidian",
  "com.microsoft.VSCode",
]);

function isBreakSafeApplication(bundleId) {
  return BREAK_SAFE_BUNDLE_IDS.has(bundleId);
}

module.exports = { isBreakSafeApplication };
