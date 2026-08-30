const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const https = require("https");
const { createHash } = require("crypto");
const { resourcesRoot } = require("./paths");

let electron = null;
try {
  electron = require("electron");
} catch {
  electron = null;
}

// The model weights the packaged app downloads on first run instead of
// bundling (#249 - a bundled DMG is ~1.3 GB). Kept in step with
// scripts/model-artifacts.mjs (transcription) and scripts/fetch-llama.sh
// (rewrite): those fill <repo>/resources/models for a source install; this
// fills <userData>/models for the packaged app, which can't write inside
// its own signed bundle.
const MODELS = [
  {
    role: "transcription",
    file: "ggml-large-v3-turbo-q5_0.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin",
    sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    bytes: 574041195,
  },
  {
    role: "rewrite",
    file: "smollm2-1.7b-instruct-q4_k_m.gguf",
    url: "https://huggingface.co/HuggingFaceTB/SmolLM2-1.7B-Instruct-GGUF/resolve/2d4a76a30b4af41ecd395c35725ac11688d4cfe4/smollm2-1.7b-instruct-q4_k_m.gguf",
    sha256: "decd2598bc2c8ed08c19adc3c8fdd461ee19ed5708679d1c54ef54a5a30d4f33",
    bytes: 1055609536,
  },
];

function userModelsDir() {
  if (electron && typeof electron === "object" && electron.app && electron.app.getPath) {
    return path.join(electron.app.getPath("userData"), "models");
  }
  return null; // dev / tests
}

// A source install has the weights under resources/models (postinstall);
// a packaged install downloads them to userData/models. Return whichever
// already holds the file, falling back to the bundled path.
function resolveModelPath(
  file,
  { userDir = userModelsDir(), bundledDir = path.join(resourcesRoot(), "models") } = {},
) {
  if (userDir) {
    const inUser = path.join(userDir, file);
    if (fs.existsSync(inUser)) return inUser;
  }
  return path.join(bundledDir, file);
}

async function sha256Of(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath).on("data", (c) => hash.update(c)).on("error", reject).on("end", resolve);
  });
  return hash.digest("hex");
}

// A weight is "good enough to use" if it exists and its size matches. Full
// sha256 verification happens once, on the download itself (streamed).
async function looksIntact(filePath, expectedBytes) {
  try {
    const stat = await fsp.stat(filePath);
    return stat.isFile() && stat.size === expectedBytes;
  } catch {
    return false;
  }
}

// https.get that follows redirects (Hugging Face resolve/ URLs 302 to a CDN).
function httpGetFollowing(url, cb, depth = 0) {
  if (depth > 5) {
    cb(null, new Error("too many redirects"));
    return;
  }
  https
    .get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        httpGetFollowing(new URL(res.headers.location, url).toString(), cb, depth + 1);
        return;
      }
      cb(res);
    })
    .on("error", (err) => cb(null, err));
}

async function downloadTo(url, destPath, sha256, onProgress = () => {}, httpGet = httpGetFollowing) {
  await fsp.mkdir(path.dirname(destPath), { recursive: true });
  const partPath = `${destPath}.part`;
  await fsp.rm(partPath, { force: true });

  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    httpGet(url, (res, err) => {
      if (err) return reject(err);
      if (res.statusCode !== 200) return reject(new Error(`download failed: HTTP ${res.statusCode}`));
      const total = Number(res.headers["content-length"]) || 0;
      let received = 0;
      const out = fs.createWriteStream(partPath);
      res.on("data", (chunk) => {
        hash.update(chunk);
        received += chunk.length;
        onProgress({ received, total });
      });
      res.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      res.pipe(out);
    });
  });

  const actual = hash.digest("hex");
  if (actual !== sha256) {
    await fsp.rm(partPath, { force: true });
    throw new Error(`checksum mismatch for ${path.basename(destPath)}: expected ${sha256}, got ${actual}`);
  }
  await fsp.rename(partPath, destPath);
}

// Ensures every weight is present. Skips one that already looks intact
// (a source install's bundled copy, or a prior download). Otherwise
// downloads it to userData/models with a streamed checksum.
//
// onProgress: ({ role, file, bytes, phase: "check"|"download"|"done"|"error",
//                received?, total?, message? })
async function ensureModels({ models = MODELS, onProgress = () => {}, httpGet = httpGetFollowing } = {}) {
  const userDir = userModelsDir();
  const results = [];
  for (const model of models) {
    onProgress({ ...model, phase: "check" });
    const existing = resolveModelPath(model.file);
    if (await looksIntact(existing, model.bytes)) {
      onProgress({ ...model, phase: "done", received: model.bytes, total: model.bytes });
      results.push({ ...model, path: existing, downloaded: false });
      continue;
    }
    if (!userDir) {
      throw new Error(`${model.file} is missing and there is no writable models directory (run \`npm install\` for a source build)`);
    }
    const dest = path.join(userDir, model.file);
    onProgress({ ...model, phase: "download", received: 0, total: model.bytes });
    try {
      await downloadTo(
        model.url,
        dest,
        model.sha256,
        (p) => onProgress({ ...model, phase: "download", received: p.received, total: p.total || model.bytes }),
        httpGet,
      );
    } catch (error) {
      onProgress({ ...model, phase: "error", message: error.message });
      throw error;
    }
    onProgress({ ...model, phase: "done", received: model.bytes, total: model.bytes });
    results.push({ ...model, path: dest, downloaded: true });
  }
  return results;
}

// True when at least one weight isn't in place yet - the caller shows the
// window and a progress screen rather than starting hidden.
function modelsMissing() {
  return MODELS.some((model) => !fs.existsSync(resolveModelPath(model.file)));
}

module.exports = { MODELS, resolveModelPath, ensureModels, modelsMissing, sha256Of, downloadTo };
