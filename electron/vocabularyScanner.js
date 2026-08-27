// #16: scan a git repo for project-specific identifiers and turn them into
// a prompt whisper.cpp can be biased with. Whisper's per-request "prompt"
// form field on /inference genuinely changes output - verified directly
// against the pinned whisper-server binary, not assumed from docs: given
// the prompt "useEffect, useState, React", a dictation of "the react
// component uses use effect and use state" transcribed useState with the
// prompt's exact casing, where it came out UseState without one.
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");

const execFileAsync = promisify(execFile);

// Extensions worth reading for identifiers. Deliberately source-code only -
// lockfiles, generated output, and binary assets have no spoken vocabulary
// in them and would just cost scan time.
const SOURCE_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift",
  ".c", ".h", ".cpp", ".hpp", ".cc", ".cs", ".php",
  ".m", ".mm",
]);

// Language keywords common enough to dominate a frequency-ranked list
// without being project-specific vocabulary at all - whisper already
// transcribes these correctly, so including them just wastes prompt budget
// that should go to identifiers whisper hasn't seen. Not exhaustive, not
// trying to be a real lexer - just enough to stop the obvious flood.
const KEYWORD_DENYLIST = new Set([
  "const", "let", "var", "function", "return", "import", "export", "default",
  "class", "interface", "type", "enum", "extends", "implements", "public",
  "private", "protected", "static", "readonly", "async", "await", "true",
  "false", "null", "undefined", "void", "this", "self", "super", "new",
  "delete", "typeof", "instanceof", "in", "of", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "try", "catch", "finally",
  "throw", "yield", "from", "with", "as", "def", "elif", "pass", "lambda",
  "none", "true", "false", "and", "or", "not", "is", "print", "func",
  "struct", "impl", "trait", "mod", "use", "pub", "fn", "let", "mut",
  "package", "namespace", "template", "using", "include", "define",
]);

const MIN_TERM_LENGTH = 3;
const MAX_FILE_CHARS = 256 * 1024; // skip pathologically large generated files
const MAX_FILES_READ = 2000;
const DEFAULT_MAX_TERMS = 150;
const DEFAULT_PROMPT_CHAR_BUDGET = 800;

const IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]{2,}\b/g;

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function extractIdentifiers(text, counts) {
  const matches = text.match(IDENTIFIER_PATTERN);
  if (!matches) return;
  for (const term of matches) {
    if (term.length < MIN_TERM_LENGTH) continue;
    const lower = term.toLowerCase();
    if (KEYWORD_DENYLIST.has(lower)) continue;
    // Pure numbers-with-underscores (e.g. a token that's all digits once
    // the leading letter/underscore requirement is satisfied) aren't real
    // vocabulary either.
    if (/^_*\d+_*$/.test(term)) continue;
    counts.set(term, (counts.get(term) || 0) + 1);
  }
}

// tools is injected so this is testable against a fake repo without a real
// git checkout or real filesystem - same DI shape as scripts/model-artifacts.mjs.
async function scanRepository(repoPath, options = {}) {
  const {
    maxTerms = DEFAULT_MAX_TERMS,
    tools = { listFiles: gitListFiles, readFile: (p) => fs.readFile(p, "utf8") },
  } = options;

  const files = (await tools.listFiles(repoPath)).filter(isSourceFile).slice(0, MAX_FILES_READ);
  const counts = new Map();
  let filesRead = 0;

  for (const relativePath of files) {
    const absolutePath = path.join(repoPath, relativePath);
    let text;
    try {
      text = await tools.readFile(absolutePath);
    } catch {
      continue; // race: tracked but deleted/moved since ls-files ran, or unreadable
    }
    if (text.length > MAX_FILE_CHARS) continue; // pathologically large generated file
    extractIdentifiers(text, counts);
    filesRead += 1;
  }

  const terms = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTerms)
    .map(([term]) => term);

  return { path: repoPath, filesRead, terms };
}

async function gitListFiles(repoPath) {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, "ls-files"], {
    maxBuffer: 1024 * 1024 * 10,
  });
  return stdout.split("\n").filter(Boolean);
}

// Whisper's initial prompt is context for the decoder, not a hard
// dictionary - past some length the marginal terms stop earning their
// tokens and just crowd out the ones that matter most (already frequency-
// ranked, so the crowd-out is the least-frequent terms, not random).
function buildPrompt(terms, options = {}) {
  const { charBudget = DEFAULT_PROMPT_CHAR_BUDGET } = options;
  if (terms.length === 0) return "";

  const kept = [];
  let length = 0;
  for (const term of terms) {
    const addedLength = kept.length === 0 ? term.length : term.length + 2; // ", "
    if (length + addedLength > charBudget) break;
    kept.push(term);
    length += addedLength;
  }
  return kept.join(", ");
}

module.exports = { scanRepository, buildPrompt, gitListFiles, SOURCE_EXTENSIONS, KEYWORD_DENYLIST };
