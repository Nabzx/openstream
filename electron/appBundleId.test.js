const test = require("node:test");
const assert = require("node:assert/strict");
const { createBundleIdReader } = require("./appBundleId");

function fakeRun(result) {
  return (_cmd, _args, _opts, callback) => {
    if (result.error) callback(result.error);
    else callback(null, result.stdout ?? "", "");
  };
}

test("reads the bundle identifier and derives a display name from the path", async () => {
  const calls = [];
  const { readBundleId } = createBundleIdReader({
    run: (cmd, args, opts, callback) => {
      calls.push({ cmd, args });
      callback(null, "com.apple.Notes\n", "");
    },
  });

  const result = await readBundleId("/Applications/Notes.app");

  assert.deepEqual(result, { bundleId: "com.apple.Notes", name: "Notes" });
  assert.equal(calls[0].cmd, "defaults");
  assert.deepEqual(calls[0].args, ["read", "/Applications/Notes.app/Contents/Info", "CFBundleIdentifier"]);
});

test("rejects a path that is not an application bundle without spawning anything", async () => {
  let ran = false;
  const { readBundleId } = createBundleIdReader({
    run: () => {
      ran = true;
    },
  });

  await assert.rejects(readBundleId("/Users/me/notes.txt"), /not an application bundle/);
  assert.equal(ran, false);
});

test("rejects with a friendly message when defaults read fails", async () => {
  const { readBundleId } = createBundleIdReader({ run: fakeRun({ error: new Error("does not exist") }) });

  await assert.rejects(readBundleId("/Applications/Mystery.app"), /couldn't read a bundle identifier from Mystery\.app/);
});

test("rejects when the plist has no CFBundleIdentifier", async () => {
  const { readBundleId } = createBundleIdReader({ run: fakeRun({ stdout: "\n" }) });

  await assert.rejects(readBundleId("/Applications/Bare.app"), /Bare\.app has no bundle identifier/);
});
