// PROTOTYPE - throwaway spike for issue #89. No production code.
//
// This app preserves the #46 responsible-process setup while exposing each
// possible Input Monitoring trigger as a separate button.
const { app, BrowserWindow, ipcMain, systemPreferences } = require("electron");
const { execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const JS_BUILD_TAG = "JS_BUILD_TAG_PLACEHOLDER";
const BUNDLE_ID = "BUNDLE_ID_PLACEHOLDER";
const HELPER_DIR = path.join(process.resourcesPath, "helpers");

function run(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: 20_000 }, (error, stdout, stderr) => {
      resolve({
        error: error ? String(error.message) : null,
        stdout,
        stderr,
      });
    });
  });
}

async function codeIdentity(target) {
  const result = await run("/usr/bin/codesign", ["-dvvv", target]);
  const text = `${result.stdout}\n${result.stderr}`;
  const value = (key) => (text.match(new RegExp(`^${key}=(.*)$`, "m")) || [])[1] || null;
  return {
    path: target,
    cdhash: value("CDHash"),
    signingIdentifier: value("Identifier"),
    teamIdentifier: value("TeamIdentifier"),
  };
}

async function hostState() {
  return {
    subject: "Electron host (TCCProbe.app)",
    jsBuildTag: JS_BUILD_TAG,
    bundleIdentifier: BUNDLE_ID,
    pid: process.pid,
    execPath: process.execPath,
    accessibility: {
      reportedTrusted: systemPreferences.isTrustedAccessibilityClient(false),
    },
    microphone: systemPreferences.getMediaAccessStatus("microphone"),
    code: await codeIdentity(app.getPath("exe").replace(/\/Contents\/MacOS\/.*$/, "")),
  };
}

async function runHelper(name, flags = []) {
  const executable = path.join(HELPER_DIR, name);
  const result = await run(executable, flags);
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout.trim().split("\n").pop());
  } catch (_) {
    // The raw output below is enough to diagnose a failed prototype build.
  }
  return {
    subject: `${name} (spawned by Electron over stdio)`,
    invokedAs: [executable, ...flags].join(" "),
    spawnError: result.error,
    raw: parsed ? null : { stdout: result.stdout, stderr: result.stderr },
    result: parsed,
    code: await codeIdentity(executable),
  };
}

function operationFlags(operation) {
  switch (operation) {
    case "request-only": return ["request-only"];
    case "tap-only": return ["tap-only"];
    case "request-and-tap": return ["request-and-tap"];
    default: return [];
  }
}

function accessibilityFlags(operation) {
  return operation === "accessibility-only" ? ["--prompt"] : [];
}

async function capture(operation) {
  return {
    capturedAt: new Date().toISOString(),
    operation,
    bundleIdentifier: BUNDLE_ID,
    host: await hostState(),
    axhelper: await runHelper("axhelper", accessibilityFlags(operation)),
    hotkeyhelper: await runHelper("hotkeyhelper", operationFlags(operation)),
  };
}

ipcMain.handle("capture", (_event, operation) => capture(operation));

const selfTest = process.argv.includes("--selftest");
const operationArgument = process.argv.find((argument) => argument.startsWith("--operation="));
const operation = operationArgument ? operationArgument.slice("--operation=".length) : "check";

app.whenReady().then(async () => {
  if (selfTest) {
    const report = await capture(operation);
    const outputArgument = process.argv.find((argument) => argument.startsWith("--out="));
    const text = JSON.stringify(report, null, 2) + "\n";
    if (outputArgument) {
      fs.writeFileSync(outputArgument.slice("--out=".length), text);
    } else {
      process.stdout.write(text);
    }
    app.exit(0);
    return;
  }

  const window = new BrowserWindow({
    width: 1_080,
    height: 900,
    title: `TCCProbe (issue #89, ${BUNDLE_ID})`,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  window.loadFile(path.join(__dirname, "index.html"));
});

app.on("window-all-closed", () => app.quit());
