// PROTOTYPE - throwaway spike for issue #46. No error handling beyond what
// makes it runnable, no abstractions, no tests. Do not build on this.
//
// The Electron host is one of the three subjects of the experiment, so it
// reports its own grant state alongside whatever the helpers report. If the
// host says trusted and a helper says not (or the reverse), that difference is
// the answer.
//
// Two ways to run it:
//   open build/TCCProbe.app            window, buttons, prompts
//   ./readstate.sh                     --selftest, prints the same JSON, no UI
const { app, BrowserWindow, ipcMain, systemPreferences } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');

const JS_BUILD_TAG = 'JS_BUILD_TAG_PLACEHOLDER';
const HELPER_DIR = path.join(process.resourcesPath, 'helpers');

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000 }, (err, stdout, stderr) => {
      resolve({ err: err ? String(err.message) : null, stdout, stderr });
    });
  });
}

// codesign is the only readable source of truth for a running binary's CDHash;
// the TCC databases themselves are SIP-protected.
async function codeIdentity(target) {
  const { stdout, stderr } = await run('/usr/bin/codesign', ['-dvvv', target]);
  const text = `${stdout}\n${stderr}`;
  const pick = (key) => (text.match(new RegExp(`^${key}=(.*)$`, 'm')) || [])[1] || null;
  return {
    path: target,
    cdhash: pick('CDHash'),
    signingIdentifier: pick('Identifier'),
    teamIdentifier: pick('TeamIdentifier'),
  };
}

async function hostState() {
  return {
    subject: 'electron host (TCCProbe.app)',
    jsBuildTag: JS_BUILD_TAG,
    pid: process.pid,
    execPath: process.execPath,
    bundleIdentifier: 'dev.openstream.prototype.tccprobe',
    accessibility: {
      // Same API the axhelper calls, asked from inside the Electron process.
      reportedTrusted: systemPreferences.isTrustedAccessibilityClient(false),
    },
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    code: await codeIdentity(app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '')),
  };
}

async function runHelper(name, flags) {
  const bin = path.join(HELPER_DIR, name);
  const { err, stdout, stderr } = await run(bin, flags || []);
  let parsed = null;
  try {
    parsed = JSON.parse(stdout.trim().split('\n').pop());
  } catch (_) { /* leave null, raw output is shown instead */ }
  return {
    subject: `${name} (spawned by the Electron main process over stdio)`,
    invokedAs: [bin, ...(flags || [])].join(' '),
    spawnError: err,
    raw: parsed ? null : { stdout, stderr },
    result: parsed,
    code: await codeIdentity(bin),
  };
}

ipcMain.handle('host-state', hostState);
ipcMain.handle('run-helper', (_e, name, flags) => runHelper(name, flags));
ipcMain.handle('host-prompt-accessibility', async () => ({
  subject: 'electron host prompting for Accessibility',
  prompted: systemPreferences.isTrustedAccessibilityClient(true),
}));

const SELFTEST = process.argv.includes('--selftest');

app.whenReady().then(async () => {
  if (SELFTEST) {
    // No window: read all three subjects and exit. Used by readstate.sh so a
    // rebuild arm can be recorded without a human clicking anything.
    //
    // The report goes to --out=<path> rather than stdout because readstate.sh
    // has to launch this through `open`, which gives no usable stdout. It
    // launches through `open` on purpose: starting the app from a shell makes
    // the *terminal's* GUI app the responsible process, which contaminates the
    // one mechanism this experiment is measuring.
    const report = {
      capturedAt: new Date().toISOString(),
      host: await hostState(),
      axhelper: await runHelper('axhelper', []),
      hotkeyhelper: await runHelper('hotkeyhelper', []),
    };
    const text = JSON.stringify(report, null, 2) + '\n';
    const outArg = process.argv.find((a) => a.startsWith('--out='));
    if (outArg) require('node:fs').writeFileSync(outArg.slice('--out='.length), text);
    else process.stdout.write(text);
    app.exit(0);
    return;
  }
  const win = new BrowserWindow({
    width: 1040,
    height: 860,
    title: `TCCProbe (js ${JS_BUILD_TAG})`,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
