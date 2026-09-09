const { execFile } = require("child_process");

// #256: short sounds at the edges of a dictation so you don't have to watch
// the overlay. Off by default. macOS ships these under /System/Library/
// Sounds, so there is nothing to bundle and afplay is always present.
const CUE_SOUNDS = {
  // Recording has started - a light tap.
  start: "Pop",
  // Text landed at the cursor - a soft confirmation.
  delivered: "Tink",
  // Couldn't place the text (held for manual paste) - a flatter note.
  held: "Basso",
};

function createSoundCues({ play = defaultPlay } = {}) {
  function cue(name) {
    const sound = CUE_SOUNDS[name];
    if (!sound) return;
    // Fire-and-forget: a cue must never hold up a recording or a delivery.
    Promise.resolve()
      .then(() => play(sound))
      .catch(() => {
        // A missing sound file or a broken afplay is not worth surfacing.
      });
  }

  return {
    recordingStarted: () => cue("start"),
    textDelivered: () => cue("delivered"),
    dictationHeld: () => cue("held"),
  };
}

function defaultPlay(sound) {
  return new Promise((resolve, reject) => {
    execFile("afplay", [`/System/Library/Sounds/${sound}.aiff`], { timeout: 4000 }, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

module.exports = { createSoundCues, CUE_SOUNDS };
