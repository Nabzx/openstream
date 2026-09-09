const { execFile } = require("child_process");

// #265: pause music while a recording is running so the mic doesn't pick it
// up, then resume it afterwards. Covers Music and Spotify via AppleScript -
// the common case. Browser video and other players are out for now (they'd
// need per-app tab scripting or the private MediaRemote framework).
//
// Best-effort throughout: the first `pause` a target app gets triggers a
// one-time macOS Automation prompt, and a denial (or no such app) just
// means nothing happens. Never blocks or fails a recording.
const CONTROLLABLE_APPS = ["Music", "Spotify"];

// Pause each app only if it is running AND currently playing, and return the
// names actually paused. `application "X" is running` is a lightweight check
// that needs no Automation grant; the `tell` block does, once per app.
const PAUSE_SCRIPT = `
set pausedApps to {}
${CONTROLLABLE_APPS.map(
  (app) => `if application "${app}" is running then
  tell application "${app}"
    if player state is playing then
      pause
      set end of pausedApps to "${app}"
    end if
  end tell
end if`,
).join("\n")}
return pausedApps`;

function resumeScript(apps) {
  return apps
    .map((app) => `if application "${app}" is running then tell application "${app}" to play`)
    .join("\n");
}

function parseAppList(stdout) {
  return stdout
    .split(",")
    .map((name) => name.trim())
    .filter((name) => CONTROLLABLE_APPS.includes(name));
}

function createMediaPause({ runAppleScript = defaultRunAppleScript, onDiagnostic = () => {} } = {}) {
  // The apps this instance paused and still owes a resume to.
  let pausedApps = [];
  let busy = false;

  async function pauseForRecording() {
    if (busy || pausedApps.length > 0) return;
    busy = true;
    try {
      pausedApps = parseAppList(await runAppleScript(PAUSE_SCRIPT));
      if (pausedApps.length > 0) onDiagnostic("mediaPause.paused", pausedApps.join(","));
    } catch (error) {
      onDiagnostic("mediaPause.error", errorMessage(error));
    } finally {
      busy = false;
    }
  }

  async function resumeAfterRecording() {
    if (pausedApps.length === 0) return;
    const toResume = pausedApps;
    pausedApps = [];
    try {
      await runAppleScript(resumeScript(toResume));
      onDiagnostic("mediaPause.resumed", toResume.join(","));
    } catch (error) {
      onDiagnostic("mediaPause.error", errorMessage(error));
    }
  }

  return { pauseForRecording, resumeAfterRecording };
}

function defaultRunAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile("osascript", ["-e", script], { timeout: 4000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout || "");
    });
  });
}

function errorMessage(error) {
  return error instanceof Error && error.message ? error.message : String(error);
}

module.exports = { createMediaPause, CONTROLLABLE_APPS };
