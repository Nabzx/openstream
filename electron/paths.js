const path = require("path");
const { app } = require("electron");

// Dev: resources/ lives at the repo root, next to electron/.
// Packaged: extraResources copies resources/ into Contents/Resources/resources,
// outside the asar archive, since spawn() can't exec a binary from inside one
// and the bundled models are too large to belong in it anyway.
function resourcesRoot() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "resources");
  }
  return path.join(__dirname, "..", "resources");
}

module.exports = { resourcesRoot };
