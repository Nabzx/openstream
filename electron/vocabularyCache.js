// #16: holds the last scan's result in memory and serves it as the
// vocabulary adapter createDictationIntake expects (getPrompt()). Scanning
// a repo touches the filesystem and can take real time on a large project,
// so it happens once - on rescan, not on every dictation - and every
// dictation just reads whatever's cached.
const { scanRepository, buildPrompt } = require("./vocabularyScanner");

function createVocabularyCache({ scan = scanRepository, buildPromptFn = buildPrompt, now = () => new Date() } = {}) {
  let state = null; // { path, terms, prompt, filesRead, scannedAt } | null

  async function rescan(repoPath) {
    if (!repoPath) {
      state = null;
      return getStatus();
    }
    const result = await scan(repoPath);
    state = {
      path: result.path,
      terms: result.terms,
      prompt: buildPromptFn(result.terms),
      filesRead: result.filesRead,
      scannedAt: now(),
    };
    return getStatus();
  }

  function getPrompt() {
    return state ? state.prompt : "";
  }

  function getStatus() {
    if (!state) return { path: null, termCount: 0, filesRead: 0, scannedAt: null };
    return {
      path: state.path,
      termCount: state.terms.length,
      filesRead: state.filesRead,
      scannedAt: state.scannedAt,
    };
  }

  return { rescan, getPrompt, getStatus };
}

module.exports = { createVocabularyCache };
