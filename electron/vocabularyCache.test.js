const test = require("node:test");
const assert = require("node:assert/strict");
const { createVocabularyCache } = require("./vocabularyCache");

test("getPrompt is empty and status is null before any scan", () => {
  const cache = createVocabularyCache();
  assert.equal(cache.getPrompt(), "");
  assert.deepEqual(cache.getStatus(), { path: null, termCount: 0, filesRead: 0, scannedAt: null });
});

test("rescan populates the prompt and status from the scanner", async () => {
  const scanCalls = [];
  const cache = createVocabularyCache({
    scan: async (repoPath) => {
      scanCalls.push(repoPath);
      return { path: repoPath, filesRead: 3, terms: ["getUserById", "userId"] };
    },
    buildPromptFn: (terms) => terms.join(", "),
    now: () => new Date("2026-01-01T00:00:00Z"),
  });

  const status = await cache.rescan("/repo");

  assert.deepEqual(scanCalls, ["/repo"]);
  assert.equal(cache.getPrompt(), "getUserById, userId");
  assert.deepEqual(status, {
    path: "/repo",
    termCount: 2,
    filesRead: 3,
    scannedAt: new Date("2026-01-01T00:00:00Z"),
  });
  assert.deepEqual(cache.getStatus(), status);
});

test("rescan with an empty/falsy path clears the cache without scanning", async () => {
  let scanned = false;
  const cache = createVocabularyCache({
    scan: async () => {
      scanned = true;
      return { path: "/repo", filesRead: 1, terms: ["term"] };
    },
  });
  await cache.rescan("/repo");
  assert.equal(cache.getPrompt(), "term");

  scanned = false;
  const status = await cache.rescan(null);

  assert.equal(scanned, false, "should not call the scanner for a null path");
  assert.equal(cache.getPrompt(), "");
  assert.deepEqual(status, { path: null, termCount: 0, filesRead: 0, scannedAt: null });
});

test("a failed rescan propagates the error and leaves the previous cache untouched", async () => {
  let shouldFail = false;
  const cache = createVocabularyCache({
    scan: async () => {
      if (shouldFail) throw new Error("not a git repository");
      return { path: "/repo", filesRead: 1, terms: ["goodTerm"] };
    },
    buildPromptFn: (terms) => terms.join(", "),
  });

  await cache.rescan("/repo");
  assert.equal(cache.getPrompt(), "goodTerm");

  shouldFail = true;
  await assert.rejects(() => cache.rescan("/bad-repo"), /not a git repository/);
  assert.equal(cache.getPrompt(), "goodTerm", "cache should be unchanged after a failed rescan");
});
