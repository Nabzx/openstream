const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { scanRepository, buildPrompt } = require("./vocabularyScanner");

function fakeTools(files) {
  return {
    listFiles: async () => Object.keys(files),
    readFile: async (absolutePath) => {
      const relative = path.relative("/repo", absolutePath);
      if (!(relative in files)) throw new Error(`no such file: ${absolutePath}`);
      return files[relative];
    },
  };
}

test("extracts identifiers and ranks them by frequency", async () => {
  const tools = fakeTools({
    "src/getUserById.js": "function getUserById(userId) { return getUserById(userId); }",
  });
  const result = await scanRepository("/repo", { tools });

  assert.equal(result.filesRead, 1);
  assert.ok(result.terms.includes("getUserById"), "getUserById should be extracted");
  assert.ok(result.terms.includes("userId"), "userId should be extracted");
  // getUserById appears 3x (definition + 2 uses), userId 2x - frequency order.
  assert.ok(result.terms.indexOf("getUserById") < result.terms.indexOf("userId"));
});

test("filters out language keywords", async () => {
  const tools = fakeTools({
    "src/x.js": "const function return import export class if else for while",
  });
  const result = await scanRepository("/repo", { tools });
  assert.deepEqual(result.terms, []);
});

test("filters terms shorter than the minimum length", async () => {
  const tools = fakeTools({ "src/x.js": "id id id ab longEnoughTerm" });
  const result = await scanRepository("/repo", { tools });
  assert.ok(!result.terms.includes("id"));
  assert.ok(!result.terms.includes("ab"));
  assert.ok(result.terms.includes("longEnoughTerm"));
});

test("filters non-source files by extension", async () => {
  const tools = fakeTools({
    "package-lock.json": "someIdentifierThatShouldBeIgnored",
    "src/real.py": "someRealIdentifier",
  });
  const result = await scanRepository("/repo", { tools });
  assert.equal(result.filesRead, 1);
  assert.ok(result.terms.includes("someRealIdentifier"));
  assert.ok(!result.terms.includes("someIdentifierThatShouldBeIgnored"));
});

test("skips a file it cannot read rather than failing the whole scan", async () => {
  const tools = {
    listFiles: async () => ["src/broken.js", "src/fine.js"],
    readFile: async (absolutePath) => {
      if (absolutePath.endsWith("broken.js")) throw new Error("EACCES");
      return "readableIdentifier";
    },
  };
  const result = await scanRepository("/repo", { tools });
  assert.equal(result.filesRead, 1);
  assert.ok(result.terms.includes("readableIdentifier"));
});

test("skips a pathologically large file rather than reading it into the term count", async () => {
  const tools = fakeTools({
    "src/generated.js": "x".repeat(300_000) + " realIdentifier",
    "src/normal.js": "normalIdentifier",
  });
  const result = await scanRepository("/repo", { tools });
  assert.equal(result.filesRead, 1);
  assert.ok(result.terms.includes("normalIdentifier"));
  assert.ok(!result.terms.includes("realIdentifier"));
});

test("caps the term count to maxTerms, keeping the most frequent", async () => {
  const source = Array.from({ length: 10 }, (_, i) => `term${i} `.repeat(10 - i)).join(" ");
  const tools = fakeTools({ "src/x.js": source });
  const result = await scanRepository("/repo", { tools, maxTerms: 3 });
  assert.equal(result.terms.length, 3);
  assert.deepEqual(result.terms, ["term0", "term1", "term2"]);
});

test("buildPrompt joins terms with a comma and stays within the char budget", () => {
  assert.equal(buildPrompt([]), "");
  assert.equal(buildPrompt(["alpha", "beta", "gamma"]), "alpha, beta, gamma");

  const long = buildPrompt(["a".repeat(10), "b".repeat(10), "c".repeat(10)], { charBudget: 15 });
  // First term (10 chars) fits; second would need +12 (", " + 10), pushing
  // past the 15 budget, so only the first is kept.
  assert.equal(long, "a".repeat(10));
});

test("real fixture: this repo's own git ls-files path works end to end", async () => {
  const repoRoot = path.resolve(__dirname, "..");
  const result = await scanRepository(repoRoot, { maxTerms: 20 });
  assert.ok(result.filesRead > 0, "should have read at least one real source file");
  assert.ok(result.terms.length > 0, "should have extracted at least one real identifier");
});
