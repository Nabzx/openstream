// The spoken commands OpenStream understands, for the Commands page.
//
// Source of truth for the behaviour is `electron/cleanup/rules.js`
// (while dictating) and `electron/voiceEditCommands.js` (editing a
// selection). This file is the human-facing description of those tables —
// keep it in step when either changes.

export type Command = {
  /** what the user says, without quotes — the page adds them */
  say: string;
  /** what it produces; `mono` when that is literal output rather than prose */
  becomes: string;
  mono?: boolean;
};

export type CommandGroup = {
  title: string;
  note?: string;
  commands: Command[];
};

export type CommandSection = {
  title: string;
  note: string;
  groups: CommandGroup[];
};

export const COMMAND_SECTIONS: CommandSection[] = [
  {
    title: "While dictating",
    note: "Say these as part of a normal dictation.",
    groups: [
      {
        title: "Line breaks & lists",
        note: "Only in break-safe apps. Everywhere else the words run on, so a stray break can't submit a command or send a message.",
        commands: [
          { say: "new paragraph", becomes: "a blank line" },
          { say: "new line", becomes: "a line break" },
          { say: "bullet point", becomes: "a “- ” list item", mono: false },
          { say: "bullet points", becomes: "same — the plural works too" },
          { say: "tab", becomes: "an indent (at the start of a phrase)" },
        ],
      },
      {
        title: "Punctuation",
        commands: [
          { say: "period  ·  full stop", becomes: ".", mono: true },
          { say: "comma", becomes: ",", mono: true },
          { say: "question mark", becomes: "?", mono: true },
          { say: "exclamation mark  ·  exclamation point", becomes: "!", mono: true },
          { say: "colon", becomes: ":", mono: true },
          { say: "semicolon", becomes: ";", mono: true },
          { say: "open paren  ·  close paren", becomes: "(   )", mono: true },
          { say: "dash", becomes: "-", mono: true },
          { say: "slash", becomes: "/", mono: true },
        ],
      },
      {
        title: "Symbols",
        commands: [
          { say: "percent", becomes: "%", mono: true },
          { say: "dollar sign", becomes: "$", mono: true },
          { say: "at sign", becomes: "@", mono: true },
          { say: "hashtag", becomes: "#", mono: true },
          { say: "open brace  ·  close brace", becomes: "{   }", mono: true },
          { say: "open bracket  ·  close bracket", becomes: "[   ]", mono: true },
        ],
      },
      {
        title: "Emoji",
        note: "Always ends with the word “emoji”, so an ordinary “my heart is racing” never turns into a symbol.",
        commands: [
          { say: "smiley face emoji", becomes: "🙂", mono: true },
          { say: "heart emoji", becomes: "❤️", mono: true },
          { say: "thumbs up emoji  ·  thumbs down emoji", becomes: "👍   👎", mono: true },
          { say: "laughing emoji", becomes: "😂", mono: true },
          { say: "crying emoji", becomes: "😢", mono: true },
          { say: "fire emoji", becomes: "🔥", mono: true },
          { say: "hundred emoji", becomes: "💯", mono: true },
        ],
      },
      {
        title: "Corrections",
        commands: [
          {
            say: "scratch that  ·  delete that",
            becomes: "removes what you just said — the whole phrase before it, not only these words",
          },
        ],
      },
      {
        title: "Quoting, spelling & numbers",
        commands: [
          { say: "quote … end quote", becomes: "wraps what's between them in “…”", mono: false },
          { say: "spell, then the letters", becomes: "“spell J O H N” → John", mono: false },
          { say: "fifty dollars", becomes: "$50", mono: true },
          { say: "three dollars and twenty cents", becomes: "$3.20", mono: true },
        ],
      },
      {
        title: "Automatic",
        note: "No command needed.",
        commands: [
          { say: "um · uh · you know · a leading “so”", becomes: "removed as filler" },
          { say: "the the problem", becomes: "the problem — repeats collapse" },
          { say: "a long dictation", becomes: "paragraph breaks placed for you, in break-safe apps" },
        ],
      },
    ],
  },
  {
    title: "Editing selected text",
    note: "Select text first, then hold the key and say the command. Nothing happens if the selection doesn't fit — an identifier command on a prose sentence is left alone.",
    groups: [
      {
        title: "Change case",
        commands: [
          { say: "snake case", becomes: "get_user_name", mono: true },
          { say: "camel case", becomes: "getUserName", mono: true },
          { say: "pascal case  ·  upper camel case", becomes: "GetUserName", mono: true },
          { say: "kebab case  ·  dash case", becomes: "get-user-name", mono: true },
          { say: "screaming snake case  ·  constant case", becomes: "GET_USER_NAME", mono: true },
          { say: "title case", becomes: "Get User Name", mono: true },
          { say: "upper case  ·  all caps", becomes: "GET USER NAME", mono: true },
          { say: "lower case", becomes: "get user name", mono: true },
        ],
      },
      {
        title: "Wrap",
        commands: [
          { say: "wrap in quotes  ·  quote that", becomes: "“text”", mono: true },
          { say: "wrap in single quotes", becomes: "'text'", mono: true },
          { say: "wrap in backticks  ·  wrap in code", becomes: "`text`", mono: true },
          { say: "wrap in parentheses  ·  wrap in brackets", becomes: "(text)", mono: true },
          { say: "wrap in square brackets", becomes: "[text]", mono: true },
          { say: "wrap in braces  ·  wrap in curlies", becomes: "{text}", mono: true },
        ],
      },
      {
        title: "Lists",
        note: "Splits the selection on commas and “and”.",
        commands: [
          { say: "bullet list  ·  bullet points", becomes: "each item on its own “- ” line" },
          { say: "numbered list  ·  ordered list", becomes: "each item numbered 1., 2., 3." },
        ],
      },
    ],
  },
];
