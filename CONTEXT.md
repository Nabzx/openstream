# openstream

A local-first voice dictation app for macOS. The user holds a key, speaks, and the spoken words are placed into whatever application is frontmost. Nothing leaves the machine.

## Language

### The dictation act

**Dictation**:
One complete act of speaking and having the resulting text placed at the cursor. Begins when the user presses the push-to-talk key and ends when the text lands.
_Avoid_: Utterance, recording, session

**Dictation latency budget**:
The time from the end of speech to the text arriving at the cursor, which the product commits to keeping under one second. It ends where the user can see it end, so the cost of placing the text is inside the budget rather than outside it.
_Avoid_: Response time, turnaround

**Provisional text**:
The text the transcription model server has produced before the user releases the key. More audio can change it, so it is never placed at the cursor and never shown to the user.
_Avoid_: Partial transcript, interim result, draft, streaming text

**Push-to-talk overlay**:
The panel shown while the user holds the key. It is the surface the app speaks to the user on during a dictation.
_Avoid_: HUD, popup, indicator

**Voice edit**:
A rewrite of text the user has already selected, requested by speaking a command such as "make this a bullet list". Distinct from dictation: the user asks for it explicitly and expects to wait.
_Avoid_: Cleanup, correction, LLM pass

### Model processes

Named by the role they fill, never by the model that currently fills it. Which model occupies a role is a separate, still-open question.

**Transcription model server**:
The process that turns captured audio into text. Fills the role currently held by `whisper-server`.
_Avoid_: whisper, STT engine, the transcriber

**Rewrite model server**:
The process that rewrites existing text on request. It serves voice edits, and it decides break placement during ordinary dictation. Fills the role currently held by `llama-server`, though the model in that role is not settled.
_Avoid_: llama-server, the LLM, cleanup model

**Model supervisor**:
The single component that owns the lifecycle of every model server: starting it, restarting it after a crash or a settings change, and releasing it.
_Avoid_: Process manager, runner, daemon

**Resident**:
A model server that is already loaded and waiting, so a request pays inference cost only and never model-load cost.
_Avoid_: Warm, preloaded, cached

**Idle release**:
Shutting a model server down after a period without requests, so it holds no memory between bursts of use.
_Avoid_: Eviction, unloading, timeout kill

### Cleanup

**Rules cleanup**:
Deterministic, non-model text tidying applied to every dictation. Costs under a millisecond. It does all cleanup except break placement, which it asks the rewrite model server to decide.
_Avoid_: Post-processing, formatting pass

**Context detection**:
Resolving the frontmost application and the focused field via the macOS Accessibility API. It is the input to break-safe determination, not the decision itself: it reports the bundle id and the AX role, and what is done with them is defined separately.
_Avoid_: App detection, focus detection, context

**Break-safe application**:
An application where inserting a line break does not submit or send. The app inserts a paragraph break only in these. Every application is treated as unsafe until it is listed.
_Avoid_: Allow-listed app, multi-line app, safe app

**Break placement**:
The choice of where paragraph breaks belong in one dictation. The rewrite model server decides it, and answers with sentence numbers rather than with text.
_Avoid_: Paragraph inference, auto-formatting, LLM cleanup
