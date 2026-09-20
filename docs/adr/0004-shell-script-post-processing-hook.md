---
status: accepted
---

# A shell script, not an LLM prompt, for the post-processing hook

[#259](https://github.com/Nabzx/openstream/issues/259) asked for a hook between
Rules-cleanup and delivery, and named two candidate shapes: a user-supplied shell
script piped the finished text, or a user-supplied prompt sent to the existing
rewrite model server. Building both was on the table too.

**Shell script only, configured as a path to an existing executable file, not an
inline command typed into Settings.** A script subsumes the LLM case rather than
sitting beside it - anyone who wants an LLM in their post-processing step can write a
script that calls one, local or otherwise, and OpenStream needs no second
process-execution surface, no prompt-template UI, and no dependency on the rewrite
model server's quality (already found unreliable at following instructions -
[#222](https://github.com/Nabzx/openstream/issues/222)'s spike). A script path also
keeps Settings from becoming a place where a full shell command is typed and run
directly from a text box; the user writes and maintains the script in their own
editor, and OpenStream only ever points at it.

This is a deliberate acceptance of an arbitrary-code-execution feature, not an
oversight. The script runs with the same access the OpenStream process has, on text
the user just spoke - there is no sandboxing beyond a timeout, and none was built. The
mitigations are: **off by default** (`postProcessScriptPath: null`), a file picker
rather than a pasted command (the user already had to have the script on disk), and an
explicit warning in Settings that the script runs with full access and should only
point at something the user trusts. Anyone using this feature is knowingly running
their own code on their own machine, the same trust boundary as any other script they
write and run themselves - this is not a plugin marketplace or a shared-script
feature, and should not become one without revisiting this decision.

## Consequences

- **`electron/postProcessHook.js` owns the mechanism** (spawn, pipe stdin, collect
  stdout, enforce a timeout, kill on expiry); `dictationCoordinator.js` owns the
  policy (a failure or timeout falls back to the un-hooked text, never blocks
  delivery, logged not surfaced). The split mirrors every other adapter in the
  coordinator - the pure decision logic is what's unit-tested against a fake, the
  real child-process mechanics are what's tested against real scripts.
- **No LLM-prompt hook exists.** If model-driven post-processing is wanted later
  (semantic voice edits per #259's own framing, or a "make this shorter" prompt).
  it can either be its own script (calling out to `llama-server`'s existing
  `/v1/chat/completions` endpoint, or any other local model) or a genuine second
  hook type - revisit this ADR if a real need for the latter shows up.
- **No inline shell-command field, and no plan to add one.** If that convenience is
  wanted later, it changes this ADR's trust framing (a copy-pasted one-liner is a
  weaker signal of "the user wrote and understands this" than a file they authored)
  and should be a deliberate reopening, not a quiet UI addition.
- **The timeout (10s default, `postProcessHook.js`'s `DEFAULT_TIMEOUT_MS`) is not
  exposed in Settings.** A user who wants a slower hook (one that calls out to a
  local LLM, say) is out of luck until this is revisited - kept minimal for v1
  rather than guessed at.
