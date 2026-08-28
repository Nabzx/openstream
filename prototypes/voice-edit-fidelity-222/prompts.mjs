// Prompt variants for the voice-edit fidelity spike (#222). Each takes a
// case ({ instruction, selection }) and returns a messages array. #67
// found that a worked example moves the model's behaviour, so we test
// zero-shot and one-shot.

const RULES =
  "You apply a single editing instruction to a piece of text the user has selected. " +
  "Return ONLY the edited text: no preamble, no explanation, no surrounding quotes, no code fences. " +
  "Change only what the instruction asks for. Preserve everything else - wording, meaning, names, numbers, and any hedges like \"I think\". " +
  "If the instruction is a question rather than an edit, return the text unchanged.";

function userTurn({ instruction, selection }) {
  return `Instruction: ${instruction}\n\nSelected text:\n${selection}`;
}

export const PROMPTS = {
  "zero-shot": (testCase) => [
    { role: "system", content: RULES },
    { role: "user", content: userTurn(testCase) },
  ],

  "strict": (testCase) => [
    {
      role: "system",
      content:
        RULES +
        " You MUST carry out the instruction - do not return the text unchanged unless the instruction is a question or explicitly says to leave it alone. " +
        "Do not add bullet points, numbering, or list formatting unless the instruction asks for a list.",
    },
    { role: "user", content: userTurn(testCase) },
  ],

  "one-shot": (testCase) => [
    { role: "system", content: RULES },
    {
      role: "user",
      content: userTurn({
        instruction: "make this a bullet list",
        selection: "We need to book the venue, send the invites and order the cake.",
      }),
    },
    {
      role: "assistant",
      content: "- We need to book the venue\n- Send the invites\n- Order the cake",
    },
    { role: "user", content: userTurn(testCase) },
  ],
};

export const SAMPLING = { temperature: 0, n_predict: 512, stream: false };
