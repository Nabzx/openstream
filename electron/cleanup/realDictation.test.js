// Eval for the rules-cleanup engine, per #15. Deterministic, so this is an
// ordinary assertion suite rather than a judged eval - a rules.js change
// either still matches every hand-verified sample or it doesn't.
//
// Every sample here must come from a real recording transcribed by the real
// whisper-server, never from `say`/TTS - see fixtures/README.md for why, and
// for how to add a new one.
const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanup } = require("./rules");
const samples = require("./fixtures/real-dictation.json");

test("real-dictation fixture set is non-empty", { skip: samples.length === 0 }, () => {
  assert.ok(samples.length > 0);
});

for (const sample of samples) {
  test(`real dictation: ${sample.id}`, () => {
    const out = cleanup(sample.raw, sample.options || {});
    assert.equal(out, sample.expected, sample.notes || sample.id);
  });
}
