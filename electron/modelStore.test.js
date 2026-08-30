const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { createHash } = require("crypto");
const { Readable } = require("stream");

const { resolveModelPath, ensureModels, downloadTo, MODELS } = require("./modelStore");

async function tmpdir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), "openstream-modelstore-"));
}

function sha(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// A fake `httpGet(url, cb)` — the contract is "hand back the final 200
// response"; redirect following lives in the real httpGetFollowing.
function fakeHttp(body) {
  return (_url, cb) => {
    const res = Readable.from([body]);
    res.statusCode = 200;
    res.headers = { "content-length": String(body.length) };
    cb(res);
  };
}

test("resolveModelPath prefers a downloaded copy in userDir over the bundled path", () => {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "os-user-"));
  const bundledDir = fs.mkdtempSync(path.join(os.tmpdir(), "os-bundled-"));
  fs.writeFileSync(path.join(bundledDir, "m.bin"), "bundled");

  assert.equal(resolveModelPath("m.bin", { userDir, bundledDir }), path.join(bundledDir, "m.bin"));

  fs.writeFileSync(path.join(userDir, "m.bin"), "downloaded");
  assert.equal(resolveModelPath("m.bin", { userDir, bundledDir }), path.join(userDir, "m.bin"));
});

test("downloadTo verifies the checksum, writes atomically, and cleans up on mismatch", async () => {
  const dir = await tmpdir();
  const body = Buffer.from("weights bytes here");
  const dest = path.join(dir, "w.bin");

  await downloadTo("https://x/w.bin", dest, sha(body), () => {}, fakeHttp(body));
  assert.equal(fs.readFileSync(dest, "utf8"), "weights bytes here");
  assert.ok(!fs.existsSync(`${dest}.part`), "the .part file is renamed away, not left behind");

  await assert.rejects(
    downloadTo("https://x/w.bin", path.join(dir, "bad.bin"), "0".repeat(64), () => {}, fakeHttp(body)),
    /checksum mismatch/,
  );
  assert.ok(!fs.existsSync(path.join(dir, "bad.bin.part")), "a mismatched download leaves nothing behind");
});

test("ensureModels skips a weight that is already the right size", async () => {
  const dir = await tmpdir();
  const body = Buffer.from("x".repeat(20));
  const model = { role: "t", file: "t.bin", url: "https://x/t.bin", sha256: sha(body), bytes: body.length };
  // Pre-place it where resolveModelPath will find it (bundled path == dir here
  // because there's no electron userDir in tests).
  const { resourcesRoot } = require("./paths");
  await fsp.mkdir(path.join(resourcesRoot(), "models"), { recursive: true });
  const bundled = path.join(resourcesRoot(), "models", "t.bin");
  await fsp.writeFile(bundled, body);
  try {
    let downloaded = false;
    const results = await ensureModels({
      models: [model],
      httpGet: () => {
        downloaded = true;
      },
    });
    assert.equal(downloaded, false);
    assert.equal(results[0].downloaded, false);
    assert.equal(results[0].path, bundled);
  } finally {
    await fsp.rm(bundled, { force: true });
  }
});

test("ensureModels throws a clear error when a weight is missing and nothing is writable", async () => {
  const model = { role: "t", file: "does-not-exist.bin", url: "https://x", sha256: "0".repeat(64), bytes: 1 };
  await assert.rejects(ensureModels({ models: [model] }), /npm install.*source build/s);
});

test("the model list matches what the servers expect", () => {
  const files = MODELS.map((m) => m.file);
  assert.ok(files.includes("ggml-large-v3-turbo-q5_0.bin"));
  assert.ok(files.includes("smollm2-1.7b-instruct-q4_k_m.gguf"));
});
