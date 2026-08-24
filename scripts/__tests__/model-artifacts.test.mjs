import { mkdtemp, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { acquirePinnedSource, acquirePinnedWeight, prepareModelArtifacts, resolveRolePaths } from "../model-artifacts.mjs";

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

describe("model artifact acquisition", () => {
  it("reuses cached weights with a matching checksum", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openstream-models-"));
    const weight = { name: "model.bin", path: path.join(root, "model.bin"), sha256: "ok", url: "https://example.test/model", size: "1 B" };
    await writeFile(weight.path, "cached");
    const calls = [];

    const result = await acquirePinnedWeight(weight, {
      async run(command, args) {
        calls.push([command, args]);
      },
      async sha256() {
        return "ok";
      },
    });

    expect(result).toEqual({ status: "cache-hit" });
    expect(calls).toEqual([]);
  });

  it("fails clearly and removes a partial file when a fetch fails", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openstream-models-"));
    const weight = { name: "model.bin", path: path.join(root, "model.bin"), sha256: "expected", url: "https://example.test/model", size: "1 B" };

    await expect(
      acquirePinnedWeight(weight, {
        async run() {
          await writeFile(weight.path, "partial");
          throw new Error("network unavailable");
        },
        async sha256() {
          return "actual";
        },
      }),
    ).rejects.toThrow("failed to fetch model.bin: network unavailable");
    expect(await exists(weight.path)).toBe(false);
  });

  it("fails loudly and removes a fetched weight on checksum mismatch", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openstream-models-"));
    const weight = { name: "model.bin", path: path.join(root, "model.bin"), sha256: "expected", url: "https://example.test/model", size: "1 B" };

    await expect(
      acquirePinnedWeight(weight, {
        async run() {
          await writeFile(weight.path, "bad");
        },
        async sha256() {
          return "actual";
        },
      }),
    ).rejects.toThrow("checksum mismatch");
    expect(await exists(weight.path)).toBe(false);
  });

  it("rejects a moved source tag", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openstream-source-"));
    const source = {
      name: "example.cpp",
      repo: "https://example.test/repo.git",
      tag: "v1",
      commit: "expected",
      directory: path.join(root, "repo"),
    };

    await expect(
      acquirePinnedSource(source, {
        async run(command, args) {
          if (command === "git" && args.includes("rev-parse")) return "actual";
          return "";
        },
      }),
    ).rejects.toThrow("expected");
    expect(await exists(source.directory)).toBe(false);
  });

  it("prepares every model role through the same source and weight mechanism", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "openstream-roles-"));
    const roles = [
      {
        role: "transcription",
        source: {
          name: "a.cpp",
          repo: "repo-a",
          tag: "a",
          commit: "commit-a",
          directory: "vendor/a",
          buildDirectory: "vendor/a/build",
          configure: [],
          target: "a-server",
          builtBinary: "vendor/a/build/a-server",
          binary: "resources/bin/a-server",
        },
        weight: { name: "a.bin", url: "url-a", sha256: "ok", path: "resources/models/a.bin", size: "1 B" },
      },
      {
        role: "rewrite",
        source: {
          name: "b.cpp",
          repo: "repo-b",
          tag: "b",
          commit: "commit-b",
          directory: "vendor/b",
          buildDirectory: "vendor/b/build",
          configure: [],
          target: "b-server",
          builtBinary: "vendor/b/build/b-server",
          binary: "resources/bin/b-server",
        },
        weight: { name: "b.bin", url: "url-b", sha256: "ok", path: "resources/models/b.bin", size: "1 B" },
      },
    ];
    const commands = [];

    await prepareModelArtifacts({
      root,
      roles,
      build: false,
      tools: {
        async run(command, args) {
          commands.push([command, args]);
          if (command === "git" && args.includes("rev-parse")) return args.includes(path.join(root, "vendor/a")) ? "commit-a" : "commit-b";
          if (command === "curl") await writeFile(args[args.indexOf("-o") + 1], "model");
          return "";
        },
        async sha256() {
          return "ok";
        },
      },
      log() {},
    });

    expect(commands.filter(([command]) => command === "curl")).toHaveLength(2);
    expect(resolveRolePaths(roles[0], root).weight.path).toBe(path.join(root, "resources/models/a.bin"));
  });
});
