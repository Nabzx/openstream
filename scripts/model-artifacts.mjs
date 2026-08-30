import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm, copyFile, readdir, lstat, readlink, symlink } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export const modelRoles = [
  {
    role: "transcription",
    source: {
      name: "whisper.cpp",
      repo: "https://github.com/ggml-org/whisper.cpp.git",
      tag: "v1.9.3",
      commit: "371b5a7561823ab2bb32142d2751e35e7534727b",
      directory: "vendor/whisper.cpp",
      buildDirectory: "vendor/whisper.cpp/build",
      configure: [
        "-DCMAKE_BUILD_TYPE=Release",
        "-DGGML_METAL=ON",
        "-DWHISPER_BUILD_EXAMPLES=ON",
        "-DWHISPER_BUILD_TESTS=OFF",
      ],
      target: "whisper-server",
      builtBinary: "vendor/whisper.cpp/build/bin/whisper-server",
      binary: "resources/bin/whisper-server",
    },
    weight: {
      name: "ggml-large-v3-turbo-q5_0.bin",
      url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/5359861c739e955e79d9a303bcbc70fb988958b1/ggml-large-v3-turbo-q5_0.bin",
      sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
      path: "resources/models/ggml-large-v3-turbo-q5_0.bin",
      size: "547 MiB",
    },
  },
  // The rewrite role used to live here too, compiled from vendor/llama.cpp
  // like whisper.cpp still is above. #14 replaced that with fetch-llama.sh
  // downloading a prebuilt macOS arm64 release instead - upstream publishes
  // one, unlike whisper.cpp - but this entry was never removed, so every
  // npm install kept silently rebuilding an old, unmaintained llama.cpp
  // checkout (tag b4331) over the top of it at the same resources/bin path.
  // See #172.
];

export function resolveRolePaths(role, root) {
  return {
    ...role,
    source: Object.fromEntries(
      Object.entries(role.source).map(([key, value]) => [
        key,
        key === "directory" || key === "buildDirectory" || key === "builtBinary" || key === "binary"
          ? path.join(root, value)
          : value,
      ]),
    ),
    weight: {
      ...role.weight,
      path: path.join(root, role.weight.path),
    },
  };
}

export async function fileSha256(filePath) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", resolve);
  });
  return hash.digest("hex");
}

async function run(command, args, options = {}) {
  try {
    const result = await execFile(command, args, { ...options, maxBuffer: 1024 * 1024 * 10 });
    return result.stdout.trim();
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
}

async function currentCommit(source, tools) {
  if (!existsSync(source.directory)) return null;
  try {
    return await tools.run("git", ["-C", source.directory, "rev-parse", "HEAD"]);
  } catch {
    return null;
  }
}

export async function acquirePinnedSource(source, tools = { run }, log = console.log) {
  log(`==> ${source.name} source (${source.tag})`);
  const existingCommit = await currentCommit(source, tools);
  if (existingCommit === source.commit) {
    log(`    already at ${source.commit}, skipping clone`);
    return { status: "cache-hit" };
  }

  await rm(source.directory, { recursive: true, force: true });
  await mkdir(path.dirname(source.directory), { recursive: true });
  await tools.run("git", ["clone", "--branch", source.tag, "--depth", "1", source.repo, source.directory]);

  const actualCommit = await tools.run("git", ["-C", source.directory, "rev-parse", "HEAD"]);
  if (actualCommit !== source.commit) {
    await rm(source.directory, { recursive: true, force: true });
    throw new Error(
      `${source.name} ${source.tag} resolved to ${actualCommit}, expected ${source.commit}. ` +
        "The pinned source moved; stopping rather than building an unverified checkout.",
    );
  }

  return { status: "fetched" };
}

export async function acquirePinnedWeight(weight, tools = { run, sha256: fileSha256 }, log = console.log) {
  log(`==> ${weight.name}`);
  await mkdir(path.dirname(weight.path), { recursive: true });

  if (existsSync(weight.path) && (await tools.sha256(weight.path)) === weight.sha256) {
    log("    already present and verified, skipping fetch");
    return { status: "cache-hit" };
  }

  await rm(weight.path, { force: true });
  log(`    fetching pinned artifact (${weight.size})`);
  try {
    await tools.run("curl", ["-fL", "--progress-bar", "-o", weight.path, weight.url]);
  } catch (error) {
    await rm(weight.path, { force: true });
    throw new Error(`failed to fetch ${weight.name}: ${error.message}`);
  }

  const actualSha256 = await tools.sha256(weight.path);
  if (actualSha256 !== weight.sha256) {
    await rm(weight.path, { force: true });
    throw new Error(
      `${weight.name} checksum mismatch\n` +
        `expected ${weight.sha256}\n` +
        `got      ${actualSha256}`,
    );
  }

  log(`    verified: ${weight.path}`);
  return { status: "fetched" };
}

export async function buildPinnedSource(source, tools = { run }, log = console.log) {
  log(`==> compiling ${path.basename(source.binary)} (Metal, Release)`);
  await tools.run("cmake", ["-S", source.directory, "-B", source.buildDirectory, ...source.configure]);
  await tools.run("cmake", ["--build", source.buildDirectory, "-j", "--config", "Release", "--target", source.target]);
  await mkdir(path.dirname(source.binary), { recursive: true });
  await copyFile(source.builtBinary, source.binary);
  await stageDylibs(source, tools, log);
  log(`    built: ${source.binary}`);
}

// whisper-server links its dylibs by @rpath, and cmake bakes an absolute
// build-dir rpath that only resolves on this machine. Stage the dylibs next
// to the staged binary and add an @loader_path rpath, so resources/bin is
// self-contained - the packaged app (#249) has no vendor/ tree to fall back
// to. llama-server already ships this way (fetch-llama.sh).
async function stageDylibs(source, tools, log) {
  const builtDir = path.dirname(source.builtBinary);
  const stagedDir = path.dirname(source.binary);
  let count = 0;
  for (const entry of await readdir(builtDir)) {
    // Skip file-sync conflicted copies ("libggml 2.dylib") and non-dylibs.
    if (!entry.endsWith(".dylib") || entry.includes(" ")) continue;
    const from = path.join(builtDir, entry);
    const to = path.join(stagedDir, entry);
    await rm(to, { force: true });
    const info = await lstat(from);
    if (info.isSymbolicLink()) await symlink(await readlink(from), to);
    else await copyFile(from, to);
    count += 1;
  }
  try {
    await tools.run("install_name_tool", ["-add_rpath", "@loader_path", source.binary]);
  } catch (error) {
    // A rebuild over an already-patched binary: @loader_path is present.
    if (!/would duplicate path|already has|LC_RPATH/i.test(error.message ?? "")) throw error;
  }
  log(`    staged ${count} dylibs alongside ${path.basename(source.binary)}`);
}

export async function prepareModelArtifacts({ root, roles = modelRoles, tools = { run, sha256: fileSha256 }, log = console.log, build = true } = {}) {
  const absoluteRoot = root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const role of roles.map((role) => resolveRolePaths(role, absoluteRoot))) {
    log(`==> ${role.role} model role`);
    await acquirePinnedSource(role.source, tools, log);
    if (build) await buildPinnedSource(role.source, tools, log);
    await acquirePinnedWeight(role.weight, tools, log);
  }
}
