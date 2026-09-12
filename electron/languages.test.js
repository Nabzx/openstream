const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSupportedLanguage,
  usesEnglishCleanup,
  SUPPORTED_LANGUAGE_CODES,
  detectScript,
  resolveEnglishCleanup,
} = require("./languages");

test("isSupportedLanguage accepts auto and every listed code, nothing else", () => {
  assert.ok(isSupportedLanguage("auto"));
  assert.ok(isSupportedLanguage("en"));
  assert.ok(isSupportedLanguage("uk"));
  assert.ok(!isSupportedLanguage("klingon"));
  assert.ok(!isSupportedLanguage(""));
  assert.ok(!isSupportedLanguage(undefined));
});

test("usesEnglishCleanup: English and auto run the full pass, a named other language does not", () => {
  assert.ok(usesEnglishCleanup("en"));
  assert.ok(usesEnglishCleanup("auto"));
  assert.ok(usesEnglishCleanup(undefined));
  assert.ok(!usesEnglishCleanup("fr"));
  assert.ok(!usesEnglishCleanup("ru"));
});

test("the code list matches FluidAudio's Language enum (28 European languages)", () => {
  assert.equal(SUPPORTED_LANGUAGE_CODES.size, 28);
});

test("#401: detectScript picks the majority script, or null with no letters", () => {
  assert.equal(detectScript("Bonjour, comment allez-vous?"), "latin");
  assert.equal(detectScript("Привет, как дела?"), "cyrillic");
  assert.equal(detectScript("Γειά σου, τι κάνεις;"), "greek");
  assert.equal(detectScript("12345 !!! ..."), null);
  assert.equal(detectScript(""), null);
});

test("#401: detectScript counts a language's own accented letters as Latin", () => {
  // Romanian ș/ț sit in Latin Extended-B, same block FluidAudio's own
  // script grouping treats as Latin.
  assert.equal(detectScript("Îmi place să învăț și să cânt"), "latin");
});

test("#401: resolveEnglishCleanup runs the full pass for en, and for auto on Latin script", () => {
  assert.equal(resolveEnglishCleanup("en", "Привет"), true);
  assert.equal(resolveEnglishCleanup("auto", "Bonjour tout le monde"), true);
  // No letters at all - stays on the safe (English) side.
  assert.equal(resolveEnglishCleanup("auto", "42"), true);
});

test("#401: resolveEnglishCleanup skips cleanup for auto on non-Latin script", () => {
  assert.equal(resolveEnglishCleanup("auto", "Привет, как дела?"), false);
  assert.equal(resolveEnglishCleanup("auto", "Γειά σου"), false);
});

test("#401: resolveEnglishCleanup leaves an explicit non-English language alone regardless of script", () => {
  // The user already said what language it is - detectScript never runs.
  assert.equal(resolveEnglishCleanup("fr", "Привет"), false);
  assert.equal(resolveEnglishCleanup("ru", "Bonjour"), false);
});
