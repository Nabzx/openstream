// #252: the languages the transcription engine (Parakeet TDT 0.6b v3 via
// FluidAudio) can be hinted towards. The codes must match FluidAudio's
// `Language` enum in native/transcription-helper - see its
// Shared/TokenLanguageFilter.swift. The hint biases the decoder's token
// filter towards that language's script; the model auto-detects the
// content regardless, so "auto" (no hint) is always valid.
const LANGUAGE_NAMES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  it: "Italian",
  pt: "Portuguese",
  ro: "Romanian",
  nl: "Dutch",
  da: "Danish",
  sv: "Swedish",
  fi: "Finnish",
  hu: "Hungarian",
  et: "Estonian",
  lv: "Latvian",
  lt: "Lithuanian",
  mt: "Maltese",
  pl: "Polish",
  cs: "Czech",
  sk: "Slovak",
  sl: "Slovenian",
  hr: "Croatian",
  bs: "Bosnian",
  ru: "Russian",
  uk: "Ukrainian",
  be: "Belarusian",
  bg: "Bulgarian",
  sr: "Serbian",
  el: "Greek",
};

// Any of these, or "auto".
const SUPPORTED_LANGUAGE_CODES = new Set(Object.keys(LANGUAGE_NAMES));

// Everything is English cleanup for now (#252): the deterministic rules in
// cleanup/rules.js are English-specific, so a dictation in another language
// gets a near-no-op pass rather than being mangled. "auto" still runs the
// full pass because it is overwhelmingly English in practice and the
// English rules are harmless on other Latin-script text.
function usesEnglishCleanup(language) {
  return !language || language === "auto" || language === "en";
}

function isSupportedLanguage(language) {
  return language === "auto" || SUPPORTED_LANGUAGE_CODES.has(language);
}

module.exports = { LANGUAGE_NAMES, SUPPORTED_LANGUAGE_CODES, isSupportedLanguage, usesEnglishCleanup };
