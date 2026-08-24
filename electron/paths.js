const path = require("path");
let electron = null;
try {
  electron = require("electron");
} catch {
  electron = null;
}

// Dev: resources/ lives at the repo root, next to electron/.
// Packaged: extraResources copies resources/ into Contents/Resources/resources,
// outside the asar archive, since spawn() can't exec a binary from inside one
// and the bundled models are too large to belong in it anyway.
//
// Outside a real Electron process (e.g. `node --test`), require("electron")
// resolves to the path of the Electron binary, a string, not the API object -
// isPackaged is unreachable there, and unpacked dev behavior is exactly right.
function resourcesRoot() {
  const isPackaged = electron && typeof electron === "object" && electron.app && electron.app.isPackaged;
  if (isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(__dirname, "..", "resources");
}

module.exports = { resourcesRoot };
