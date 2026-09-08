// Shared limits and messages for the spoken "paste" commands: the paste
// at the cursor during dictation (#375/#377) and the paste over a
// selection on the voice-edit path (#378). Kept in one place so the two
// coordinators can't drift apart on the cap or the wording.

// A clipboard bigger than this is not what a spoken "paste" is for.
const PASTE_MAX_CHARS = 10000;

const EMPTY_CLIPBOARD_MESSAGE = "Nothing on the clipboard to paste";

function clipboardTooBigMessage(length) {
  return `The clipboard is too big to paste (${length} characters)`;
}

module.exports = { PASTE_MAX_CHARS, EMPTY_CLIPBOARD_MESSAGE, clipboardTooBigMessage };
