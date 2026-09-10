const test = require("node:test");
const assert = require("node:assert/strict");
const { isSupportedLanguage, usesEnglishCleanup, SUPPORTED_LANGUAGE_CODES } = require("./languages");

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
