# openstream

A local-first voice dictation app for macOS. The user holds a key, speaks, and the spoken words are placed into whatever application is frontmost. Nothing leaves the machine.

## Language

### The dictation act

**Dictation**:
One complete act of speaking and having the resulting text placed at the cursor. Begins when the user presses the push-to-talk key and ends when the text lands.
_Avoid_: Utterance, recording, session

**Dictation latency budget**:
The time from the end of speech to text being ready, which the product commits to keeping under one second.
_Avoid_: Response time, turnaround

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

**Break-safe application**:
An application where inserting a line break does not submit or send. The app inserts a paragraph break only in these. Every application is treated as unsafe until it is listed.
_Avoid_: Allow-listed app, multi-line app, safe app

**Break placement**:
The choice of where paragraph breaks belong in one dictation. The rewrite model server decides it, and answers with sentence numbers rather than with text.
_Avoid_: Paragraph inference, auto-formatting, LLM cleanup
