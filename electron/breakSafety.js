// Deny-by-default: a literal line break can execute a half-typed terminal
// command or send an unfinished chat message, so every app not explicitly
// listed here is treated as unsafe. See #19 - this used to be a hardcoded
// constant; it's mutable now so the settings UI can edit it, but the
// default and the safety posture are unchanged.
const DEFAULT_BREAK_SAFE_BUNDLE_IDS = [
  "com.apple.TextEdit",
  "com.apple.Notes",
  "md.obsidian",
  "com.microsoft.VSCode",
];

// Friendly names for the built-in entries, so the settings list reads as
// "Notes" rather than a bare bundle id. User-added apps carry the name the
// picker resolved; a manually typed id just shows as itself.
const DEFAULT_BREAK_SAFE_APP_NAMES = {
  "com.apple.TextEdit": "TextEdit",
  "com.apple.Notes": "Notes",
  "md.obsidian": "Obsidian",
  "com.microsoft.VSCode": "Visual Studio Code",
};

let breakSafeBundleIds = new Set(DEFAULT_BREAK_SAFE_BUNDLE_IDS);

function isBreakSafeApplication(bundleId) {
  return breakSafeBundleIds.has(bundleId);
}

function setBreakSafeApplications(bundleIds) {
  breakSafeBundleIds = new Set(bundleIds);
}

function getBreakSafeApplications() {
  return [...breakSafeBundleIds];
}

module.exports = {
  isBreakSafeApplication,
  setBreakSafeApplications,
  getBreakSafeApplications,
  DEFAULT_BREAK_SAFE_BUNDLE_IDS,
  DEFAULT_BREAK_SAFE_APP_NAMES,
};
