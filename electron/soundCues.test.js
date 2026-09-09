const test = require("node:test");
const assert = require("node:assert/strict");
const { createSoundCues, CUE_SOUNDS } = require("./soundCues");

function nextTick() {
  return new Promise((resolve) => setImmediate(resolve));
}

test("each cue plays its mapped system sound", async () => {
  const played = [];
  const cues = createSoundCues({ play: async (sound) => played.push(sound) });

  cues.recordingStarted();
  cues.textDelivered();
  cues.dictationHeld();
  await nextTick();

  assert.deepEqual(played, [CUE_SOUNDS.start, CUE_SOUNDS.delivered, CUE_SOUNDS.held]);
});

test("a play failure is swallowed, never thrown", async () => {
  const cues = createSoundCues({
    play: async () => {
      throw new Error("afplay: no such file");
    },
  });
  assert.doesNotThrow(() => cues.recordingStarted());
  await nextTick();
});

test("the cue call returns immediately, before play resolves", async () => {
  let resolved = false;
  const cues = createSoundCues({
    play: () => new Promise((resolve) => setTimeout(() => ((resolved = true), resolve()), 50)),
  });
  cues.textDelivered();
  assert.equal(resolved, false);
});
