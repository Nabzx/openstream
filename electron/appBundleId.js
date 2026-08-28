const { execFile } = require("child_process");
const path = require("path");

// Reads an .app bundle's CFBundleIdentifier. `defaults read` is the
// canonical macOS way to do this - it handles the binary Info.plist that
// most apps ship, which a plain JSON/plist parse in Node would choke on.
//
// execFile is injected so this is testable without a real .app on disk.
function createBundleIdReader({ run = execFile } = {}) {
  function readBundleId(appPath) {
    return new Promise((resolve, reject) => {
      if (typeof appPath !== "string" || !appPath.endsWith(".app")) {
        reject(new Error("not an application bundle"));
        return;
      }
      const infoPath = path.join(appPath, "Contents", "Info");
      run("defaults", ["read", infoPath, "CFBundleIdentifier"], { timeout: 4000 }, (error, stdout) => {
        if (error) {
          reject(new Error(`couldn't read a bundle identifier from ${path.basename(appPath)}`));
          return;
        }
        const bundleId = String(stdout).trim();
        if (!bundleId) {
          reject(new Error(`${path.basename(appPath)} has no bundle identifier`));
          return;
        }
        resolve({ bundleId, name: path.basename(appPath, ".app") });
      });
    });
  }

  return { readBundleId };
}

module.exports = { createBundleIdReader };
