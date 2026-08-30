// Deny-by-default: a literal line break can execute a half-typed terminal
// command or send an unfinished chat message, so every app not explicitly
// listed here is treated as unsafe. See #19 - this used to be a hardcoded
// constant; it's mutable now so the settings UI can edit it, but the
// default and the safety posture are unchanged.
// #307: the original four left most writing surfaces unlisted, so a spoken
// "new paragraph" silently did nothing in them. Added the common document
// editors and note apps where a newline is always safe. Deliberately not
// here: terminals, chat apps (Slack, Messages, Discord), and browsers - a
// newline in those can submit something half-finished, which is the whole
// point of the allow-list.
const DEFAULT_BREAK_SAFE_BUNDLE_IDS = [
  "com.apple.TextEdit",
  "com.apple.Notes",
  "md.obsidian",
  "com.microsoft.VSCode",
  "net.shinyfrog.bear",
  "pro.writer.mac",
  "com.ulyssesapp.mac",
  "com.literatureandlatte.scrivener3",
  "com.apple.iWork.Pages",
  "com.microsoft.Word",
  "com.apple.dt.Xcode",
  "com.sublimetext.4",
  "dev.zed.Zed",
  "notion.id",
];

// Friendly names for the built-in entries, so the settings list reads as
// "Notes" rather than a bare bundle id. User-added apps carry the name the
// picker resolved; a manually typed id just shows as itself.
const DEFAULT_BREAK_SAFE_APP_NAMES = {
  "com.apple.TextEdit": "TextEdit",
  "com.apple.Notes": "Notes",
  "md.obsidian": "Obsidian",
  "com.microsoft.VSCode": "Visual Studio Code",
  "net.shinyfrog.bear": "Bear",
  "pro.writer.mac": "iA Writer",
  "com.ulyssesapp.mac": "Ulysses",
  "com.literatureandlatte.scrivener3": "Scrivener",
  "com.apple.iWork.Pages": "Pages",
  "com.microsoft.Word": "Microsoft Word",
  "com.apple.dt.Xcode": "Xcode",
  "com.sublimetext.4": "Sublime Text",
  "dev.zed.Zed": "Zed",
  "notion.id": "Notion",
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
