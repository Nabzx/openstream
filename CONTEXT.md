# OpenStream

A local-first voice dictation tool for developers on macOS. It turns speech into text in whatever application has focus, adapting the formatting to what the user is typing into.

## Language

**Dictation path**:
Everything between the user releasing the hotkey and text appearing at the cursor. Latency here is budgeted end to end (under 1s, see ADR-0001) because the user is mid-flow and waiting.
_Avoid_: pipeline, hot path

**Cleanup**:
The deterministic, rule-based pass that turns a raw transcript into text fit to inject - filler removal, stutter collapse, spoken punctuation, sentence segmentation, capitalisation. Since ADR-0001 this is **always rule-based**; "cleanup" never means a model pass.
_Avoid_: LLM cleanup, cleanup pass, post-processing

**Voice editing**:
Selecting existing text and speaking a command that rewrites it in place. The only feature that uses a local LLM, and the only place where a multi-second wait is acceptable, because the user explicitly asked for a rewrite.
_Avoid_: voice commands, rewrite mode

**Mode**:
The formatting regime chosen from the focused field - terminal, code editor, or prose. Determines what cleanup is allowed to do, such as suppressing capitalisation and punctuation in a terminal.
_Avoid_: context (ambiguous with the frontmost-app detection that produces the mode), profile

**Context detection**:
Resolving the frontmost application and focused field via the macOS Accessibility API in order to produce a mode. Distinct from the mode itself, and from what the mode does to text.
_Avoid_: app detection, focus detection
