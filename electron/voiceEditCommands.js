// Voice-edit command grammar and transforms (#17). A fixed, finite set of
// spoken commands, each mapped to a deterministic string transform. No
// model, no I/O - the whole file is pure and sub-millisecond. Semantic
// commands ("shorter", "fix grammar") are deliberately absent; see #222.
//
// interpretVoiceEditCommand(spokenText, selection) is the entry point.

const COMMANDS = {
  // case conversions
  snake: { kind: "case", aliases: ["snake case", "snakecase", "snake case that"] },
  camel: { kind: "case", aliases: ["camel case", "camelcase"] },
  pascal: { kind: "case", aliases: ["pascal case", "upper camel case", "pascalcase"] },
  kebab: { kind: "case", aliases: ["kebab case", "dash case", "hyphen case", "kebabcase"] },
  constant: { kind: "case", aliases: ["screaming snake case", "constant case", "upper snake case"] },
  title: { kind: "case", aliases: ["title case"] },
  upper: { kind: "case", aliases: ["upper case", "uppercase", "all caps"] },
  lower: { kind: "case", aliases: ["lower case", "lowercase"] },
  // wraps
  "wrap-double": { kind: "wrap", pair: ['"', '"'], aliases: ["wrap in quotes", "add quotes", "wrap in double quotes", "quote that"] },
  "wrap-single": { kind: "wrap", pair: ["'", "'"], aliases: ["wrap in single quotes"] },
  "wrap-backtick": { kind: "wrap", pair: ["`", "`"], aliases: ["wrap in backticks", "wrap in code", "wrap in a code span", "code that"] },
  "wrap-paren": { kind: "wrap", pair: ["(", ")"], aliases: ["wrap in parentheses", "wrap in parens", "wrap in brackets", "wrap in round brackets"] },
  "wrap-square": { kind: "wrap", pair: ["[", "]"], aliases: ["wrap in square brackets"] },
  "wrap-brace": { kind: "wrap", pair: ["{", "}"], aliases: ["wrap in braces", "wrap in curly braces", "wrap in curlies"] },
  // structural
  bullets: { kind: "list", marker: "bullet", aliases: ["bullet list", "bulleted list", "bullet points", "bullet point list", "make a bullet list"] },
  numbered: { kind: "list", marker: "number", aliases: ["numbered list", "number list", "ordered list"] },
  // clipboard (#374) - the one command that never rewrites the selection.
  // interpretVoiceEditCommand still returns it as an "ok" result with
  // commandId "copy"; the coordinator reads that id to route to the
  // clipboard instead of injection, same as it already reads other ids.
  copy: { kind: "copy", aliases: ["copy that", "copy this", "copy it", "copy"] },
};

const ALIAS_TO_ID = new Map();
for (const [id, spec] of Object.entries(COMMANDS)) {
  for (const alias of spec.aliases) ALIAS_TO_ID.set(alias, id);
}

// Leading phrases people add without changing the command.
const CARRIER = /^(?:please\s+)?(?:make (?:this|it)|turn (?:this|it) into(?: a)?|change (?:this|it) to|convert (?:this|it) to|put (?:this|it) in)\s+/;

function normalise(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[.,!?;:]+$/, "")
    .replace(/\s+/g, " ")
    .replace(/^wrap (?:this|it) in\b/, "wrap in");
}

function matchCommand(spokenText) {
  const normalised = normalise(spokenText);
  const candidates = [normalised, normalised.replace(CARRIER, "")];
  for (const candidate of candidates) {
    const id = ALIAS_TO_ID.get(candidate);
    if (id) return { id, ...COMMANDS[id] };
  }
  return null;
}

// Split into words on whitespace, _, -, and camelCase / PascalCase / acronym
// boundaries: "getUserID" -> ["get", "User", "ID"], "user_profile name" ->
// ["user", "profile", "name"].
function tokenise(text) {
  return text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean);
}

function capitalise(word) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

// An identifier case on obvious prose is a mistake, not an edit: punctuation
// that no identifier carries, or simply too many words to be a name.
const PROSE_CHARS = /[,;:!?()[\]{}"'`\n]/;
const MAX_IDENTIFIER_WORDS = 6;

function applyCase(id, selection) {
  const trimmed = selection.trim();

  if (id === "upper") return selection.toUpperCase();
  if (id === "lower") return selection.toLowerCase();
  if (id === "title") return tokenise(trimmed).map((w) => capitalise(w.toLowerCase())).join(" ");

  // identifier cases - work off the selection minus one trailing full stop
  const forIdentifier = trimmed.replace(/\.\s*$/, "");
  if (PROSE_CHARS.test(forIdentifier)) return null;
  const words = tokenise(forIdentifier).map((w) => w.toLowerCase());
  if (words.length === 0 || words.length > MAX_IDENTIFIER_WORDS) return null;
  switch (id) {
    case "snake":
      return words.join("_");
    case "kebab":
      return words.join("-");
    case "constant":
      return words.map((w) => w.toUpperCase()).join("_");
    case "pascal":
      return words.map(capitalise).join("");
    case "camel":
      return words.map((w, i) => (i === 0 ? w : capitalise(w))).join("");
    default:
      return null;
  }
}

function applyWrap(command, selection) {
  return command.pair[0] + selection + command.pair[1];
}

function splitListItems(selection) {
  if (selection.includes("\n")) return null;
  const items = selection
    .replace(/\.\s*$/, "")
    .split(/\s*,\s*|\s+and\s+|\s+or\s+/i)
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length >= 2 ? items : null;
}

function applyList(command, selection) {
  const items = splitListItems(selection);
  if (!items) return null;
  return command.marker === "number"
    ? items.map((item, n) => `${n + 1}. ${item}`).join("\n")
    : items.map((item) => `- ${item}`).join("\n");
}

function applyCommand(command, selection) {
  if (command.kind === "case") return applyCase(command.id, selection);
  if (command.kind === "wrap") return applyWrap(command, selection);
  if (command.kind === "list") return applyList(command, selection);
  if (command.kind === "copy") return selection;
  return null;
}

function interpretVoiceEditCommand(spokenText, selection) {
  const command = matchCommand(spokenText);
  if (!command) return { status: "unrecognised" };

  const result = applyCommand(command, selection);
  if (result === null) {
    return {
      status: "declined",
      commandId: command.id,
      reason:
        command.kind === "list"
          ? "that doesn't look like a list"
          : "that doesn't look like an identifier",
    };
  }
  return { status: "ok", commandId: command.id, result };
}

module.exports = { interpretVoiceEditCommand, matchCommand, COMMANDS };
