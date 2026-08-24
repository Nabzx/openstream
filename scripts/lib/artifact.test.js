const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");

// Exercises the shell functions in artifact.sh directly, in isolated temp
// directories, over file:// URLs and local git repos - no network access
// needed, so these run the same in CI as on a laptop. See #92.

const LIB_PATH = path.join(__dirname, "artifact.sh");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
}

// Runs one statement against a fresh bash with artifact.sh sourced, the same
// way build-whisper.sh and build-llama.sh use it.
function runBash(script) {
  try {
    const stdout = execFileSync("bash", ["-c", `set -euo pipefail; source "${LIB_PATH}"; ${script}`], {
      encoding: "utf8",
    });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

function initFixtureRepo(dir) {
  execFileSync("git", ["init", "-q", dir]);
  execFileSync("git", ["-C", dir, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", dir, "config", "user.name", "test"]);
  fs.writeFileSync(path.join(dir, "file.txt"), "v1");
  execFileSync("git", ["-C", dir, "add", "."]);
  execFileSync("git", ["-C", dir, "commit", "-q", "-m", "v1"]);
  execFileSync("git", ["-C", dir, "tag", "v1"]);
  return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
}

test("sha256: matches a known digest", () => {
  const dir = mkTmpDir();
  const file = path.join(dir, "f.txt");
  fs.writeFileSync(file, "hello");

  const result = runBash(`sha256 "${file}"`);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), sha256("hello"));
});

test("fetch_verified: cache hit skips the fetch entirely", () => {
  const dir = mkTmpDir();
  const dest = path.join(dir, "artifact.bin");
  const content = "cached and correct";
  fs.writeFileSync(dest, content);
  const digest = sha256(content);

  // A source that would fail if actually fetched from, proving the
  // cache-hit path never calls curl.
  const result = runBash(`fetch_verified "file:///does/not/exist" "${dest}" "${digest}"`);
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(dest, "utf8"), content);
});

test("fetch_verified: downloads and verifies a correct artifact", () => {
  const dir = mkTmpDir();
  const source = path.join(dir, "source.bin");
  const dest = path.join(dir, "dest.bin");
  const content = "freshly fetched";
  fs.writeFileSync(source, content);
  const digest = sha256(content);

  const result = runBash(`fetch_verified "file://${source}" "${dest}" "${digest}"`);
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(dest, "utf8"), content);
});

test("fetch_verified: checksum mismatch fails and removes the bad file", () => {
  const dir = mkTmpDir();
  const source = path.join(dir, "source.bin");
  const dest = path.join(dir, "dest.bin");
  fs.writeFileSync(source, "tampered content");
  const wrongDigest = sha256("something else entirely");

  const result = runBash(`fetch_verified "file://${source}" "${dest}" "${wrongDigest}"`);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(dest), false, "a checksum-mismatched download must not be left behind");
});

test("fetch_verified: fetch failure leaves no partial file behind", () => {
  const dir = mkTmpDir();
  const dest = path.join(dir, "dest.bin");

  const result = runBash(`fetch_verified "file:///no/such/path" "${dest}" "deadbeef"`);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(dest), false);
});

test("clone_pinned: cache hit skips the clone entirely", () => {
  const dir = mkTmpDir();
  const dest = path.join(dir, "dest");
  const commit = initFixtureRepo(dest);

  // A repo URL that would fail if actually cloned from, proving the
  // cache-hit path never calls git clone.
  const result = runBash(`clone_pinned "file:///does/not/exist" "v1" "${commit}" "${dest}"`);
  assert.equal(result.status, 0);
});

test("clone_pinned: clones a fresh checkout at the pinned tag", () => {
  const dir = mkTmpDir();
  const source = path.join(dir, "source");
  const commit = initFixtureRepo(source);
  const dest = path.join(dir, "dest");

  const result = runBash(`clone_pinned "file://${source}" "v1" "${commit}" "${dest}"`);
  assert.equal(result.status, 0);
  const actualCommit = execFileSync("git", ["-C", dest, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(actualCommit, commit);
});

test("clone_pinned: fails when the tag no longer resolves to the pinned commit", () => {
  const dir = mkTmpDir();
  const source = path.join(dir, "source");
  initFixtureRepo(source);
  const dest = path.join(dir, "dest");
  const wrongCommit = "0".repeat(40);

  const result = runBash(`clone_pinned "file://${source}" "v1" "${wrongCommit}" "${dest}"`);
  assert.notEqual(result.status, 0);
});
