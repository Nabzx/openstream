#!/usr/bin/env node
// `npm run doctor` - reports which macOS permissions OpenStream is missing
// and how to restore them, without launching the app. Same verdict logic
// the app-start gate uses (electron/permissions.js).
//
// Accessibility and Input Monitoring are read by spawning the accessibility
// helper and asking it (macOS attributes both grants to whatever spawns it,
// #46). Microphone can't be checked outside Electron, and it's never
// blocking - macOS prompts for it on the first dictation - so it's reported
// as "not checked here".

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const { evaluatePermissions } = require("../electron/permissions.js");
const { resourcesRoot } = require("../electron/paths.js");

const HELPER = path.join(resourcesRoot(), "bin", "accessibility-helper");

function askHelper(timeoutMs = 4000) {
  return new Promise((resolve) => {
    const child = spawn(HELPER, [], { stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    const done = (value) => {
      child.kill();
      resolve(value);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (const line of buffer.split("\n")) {
        try {
          const message = JSON.parse(line);
          if (message.id === "1") {
            clearTimeout(timer);
            done(message);
          }
        } catch {
          // partial line
        }
      }
    });
    child.stdin.write('{"id":"1","cmd":"permissions"}\n');
  });
}

const STATE_TEXT = {
  granted: "OK",
  missing: "NOT GRANTED",
  unknown: "could not check",
  pending: "not asked yet",
};

const reply = await askHelper();
if (!reply) {
  console.error(`doctor: could not run ${path.relative(process.cwd(), HELPER)} - build it with 'npm run build:accessibility-helper'`);
  process.exit(2);
}

const verdict = evaluatePermissions({
  accessibility: reply.accessibility,
  inputMonitoring: reply.inputMonitoring,
  microphone: "not-determined", // not checkable here; never blocking
});

console.log("OpenStream permissions\n");
for (const row of verdict.details) {
  const note = row.key === "microphone" ? "  (checked by the app on first dictation)" : "";
  console.log(`  ${row.label.padEnd(18)} ${STATE_TEXT[row.state] ?? row.state}${note}`);
}

if (verdict.ok) {
  console.log("\nAll required permissions are in place.");
  process.exit(0);
}

console.log("\nTo fix - in System Settings > Privacy & Security:");
for (const key of verdict.blocking) {
  const row = verdict.details.find((d) => d.key === key);
  console.log(`  - ${row.label}: remove any old OpenStream entry, then add this build and enable it.`);
  console.log(`    open with: open "${row.settingsUrl}"`);
}
console.log("\n(Because OpenStream runs from source, every rebuild resets these - see docs/testing.)");
process.exit(1);
