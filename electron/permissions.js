// #47: turns the three raw grant states into a verdict the app acts on.
// Pure - main.js gathers the raw states (Accessibility + Input Monitoring
// from the accessibility helper, Microphone from Electron's
// systemPreferences) and feeds them here.
//
// Accessibility and Input Monitoring are hard requirements: without them
// push-to-talk silently does nothing, which is the worst failure mode.
// Microphone can be re-prompted by macOS inline, so a not-yet-decided
// mic is a soft state, not a block.

const LABELS = {
  accessibility: "Accessibility",
  inputMonitoring: "Input Monitoring",
  microphone: "Microphone",
};

// macOS Settings deep links - shell.openExternal() opens the exact pane.
const SETTINGS_URLS = {
  accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  inputMonitoring: "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent",
  microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
};

function classifyAccessibility(trusted) {
  return trusted === true ? "granted" : "missing";
}

function classifyInputMonitoring(state) {
  if (state === "granted") return "granted";
  if (state === "denied") return "missing";
  return "unknown"; // IOHIDCheckAccess couldn't tell
}

function classifyMicrophone(status) {
  if (status === "granted") return "granted";
  if (status === "denied" || status === "restricted") return "missing";
  return "pending"; // "not-determined" - macOS will prompt on first capture
}

function evaluatePermissions(raw) {
  const grants = {
    accessibility: classifyAccessibility(raw.accessibility),
    inputMonitoring: classifyInputMonitoring(raw.inputMonitoring),
    microphone: classifyMicrophone(raw.microphone),
  };

  // A hard requirement counts as blocking when it's missing, and also when
  // it's "unknown" - we can't confirm push-to-talk will work, so the user
  // should still be pointed at the setting.
  const blocking = ["accessibility", "inputMonitoring"].filter(
    (key) => grants[key] === "missing" || grants[key] === "unknown",
  );
  const warnings = grants.microphone === "missing" ? ["microphone"] : [];

  return {
    ok: blocking.length === 0,
    grants,
    blocking,
    warnings,
    // ready to render: [{ key, label, state, settingsUrl }]
    details: Object.keys(LABELS).map((key) => ({
      key,
      label: LABELS[key],
      state: grants[key],
      settingsUrl: SETTINGS_URLS[key],
    })),
  };
}

module.exports = { evaluatePermissions, SETTINGS_URLS, LABELS };
