const test = require("node:test");
const assert = require("node:assert/strict");
const { interpretVoiceEditCommand, matchCommand } = require("./voiceEditCommands");

function result(spoken, selection) {
  return interpretVoiceEditCommand(spoken, selection);
}

test("case: snake_case an identifier", () => {
  assert.deepEqual(result("snake case", "getUserProfileData"), {
    status: "ok",
    commandId: "snake",
    result: "get_user_profile_data",
  });
});

test("case: camelCase a spoken phrase", () => {
  assert.equal(result("camel case", "user profile display name").result, "userProfileDisplayName");
});

test("case: PascalCase, kebab-case, CONSTANT_CASE", () => {
  assert.equal(result("pascal case", "get user profile").result, "GetUserProfile");
  assert.equal(result("kebab case", "get user profile").result, "get-user-profile");
  assert.equal(result("screaming snake case", "get user profile").result, "GET_USER_PROFILE");
});

test("case: acronym boundaries split sensibly", () => {
  assert.equal(result("snake case", "getUserID").result, "get_user_id");
  assert.equal(result("kebab case", "HTTPServerError").result, "http-server-error");
});

test("case: title / upper / lower keep spaces and punctuation as appropriate", () => {
  assert.equal(result("title case", "local first voice dictation").result, "Local First Voice Dictation");
  assert.equal(result("upper case", "The meeting is at 3pm.").result, "THE MEETING IS AT 3PM.");
  assert.equal(result("lower case", "SHOUTING TEXT").result, "shouting text");
});

test("case: an identifier command on obvious prose is declined", () => {
  const r = result("snake case", "The meeting is at 3pm in room 2.");
  assert.equal(r.status, "declined");
  assert.match(r.reason, /identifier/);
});

test("case: a single trailing period does not block an identifier command", () => {
  assert.equal(result("camel case", "user profile.").result, "userProfile");
});

test("wrap: quotes, backticks, brackets, braces", () => {
  assert.equal(result("wrap in quotes", "hello").result, '"hello"');
  assert.equal(result("wrap in backticks", "code").result, "`code`");
  assert.equal(result("wrap in parentheses", "note").result, "(note)");
  assert.equal(result("wrap in curly braces", "x").result, "{x}");
});

test("wrap: preserves the selection exactly, including inner punctuation", () => {
  assert.equal(result("wrap in quotes", "a, b and c").result, '"a, b and c"');
});

test("list: a comma-and list becomes bullets", () => {
  assert.equal(
    result("bullet list", "milk, eggs, bread and coffee").result,
    "- milk\n- eggs\n- bread\n- coffee",
  );
});

test("list: a numbered list", () => {
  assert.equal(result("numbered list", "book the venue, send invites and order the cake").result, "1. book the venue\n2. send invites\n3. order the cake");
});

test("list: 'or' also delimits; one trailing period is stripped", () => {
  assert.equal(result("bullet list", "yes or no.").result, "- yes\n- no");
});

test("list: fewer than two items is declined", () => {
  assert.equal(result("bullet list", "just one thing").status, "declined");
});

test("list: a multi-line selection is declined", () => {
  assert.equal(result("bullet list", "line one\nline two, line three").status, "declined");
});

test("#374: copy that returns the selection unchanged as the result", () => {
  assert.deepEqual(result("copy that", "hello world"), {
    status: "ok",
    commandId: "copy",
    result: "hello world",
  });
});

test("#374: copy's other aliases and trailing punctuation all match", () => {
  for (const spoken of ["copy this", "copy it", "copy", "Copy that."]) {
    assert.equal(result(spoken, "some text").commandId, "copy", spoken);
  }
});

test("#374: copy never declines - any selection, however prose-like, can be copied", () => {
  assert.equal(result("copy that", "a whole sentence, with punctuation!").status, "ok");
});

test("unrecognised command leaves an explicit status", () => {
  assert.deepEqual(result("make this sing", "whatever"), { status: "unrecognised" });
});

test("semantic commands are deliberately not recognised", () => {
  for (const spoken of ["make this shorter", "fix the grammar", "improve this", "rephrase this"]) {
    assert.equal(result(spoken, "some text").status, "unrecognised", spoken);
  }
});

test("carrier phrases are tolerated", () => {
  assert.equal(matchCommand("make this snake case").id, "snake");
  assert.equal(matchCommand("turn this into a bullet list").id, "bullets");
  assert.equal(matchCommand("wrap this in backticks").id, "wrap-backtick");
});

test("trailing punctuation and casing in the spoken command don't matter", () => {
  assert.equal(matchCommand("Snake Case.").id, "snake");
  assert.equal(matchCommand("  BULLET LIST  ").id, "bullets");
});
