# OpenStream

OpenStream is a local-first voice dictation app for Apple Silicon Macs. Hold a global hotkey, speak, then release it to place the transcript in the frontmost application. Audio and model requests stay on the Mac.

This repository is a development fork of [Nabzx/openstream](https://github.com/Nabzx/openstream). It now contains a runnable dictation path, an unsigned DMG build, and a tested completed-Dictation intake module. There is no published, signed release yet.

## What works

The current app can:

- run as a macOS menu bar app
- listen for `Control+Option+D` through a native hotkey helper
- record while the hotkey is held and transcribe after release
- keep `whisper-server` resident instead of loading it for each dictation
- insert text at the cursor through a separate Accessibility helper
- fall back from direct field writes to clipboard paste or synthesized keystrokes
- show recording and transcription state in the tray, plus a small recording overlay
- build an unsigned Apple Silicon DMG with `npm run dist`

The runnable path has tested rules cleanup and a completed-Dictation intake module. It covers Context detection, one-line fields, break-safe applications, paragraph break replies, Held results, failure outcomes, and FIFO processing of completed recordings.

## Why another dictation app

Most dictation tools treat every target the same. That is risky when a newline can submit a terminal command or send a chat message. OpenStream is moving toward a deny-by-default rule for line breaks. It checks the frontmost app and focused field before deciding whether a break is safe.

The planned product has two other developer-focused features:

- codebase vocabulary biasing, using identifiers and project terms to improve transcription
- voice edits, where selected text can be rewritten with a spoken command such as "make this a bullet list"

Neither feature is available in the app yet.

## Build and run

### Requirements

- Apple Silicon Mac
- macOS 13 or newer
- Node.js 20 or newer
- Xcode Command Line Tools
- CMake, Git, and curl
- A network connection for model and server downloads during installation

Clone this fork and install its dependencies:

```bash
git clone https://github.com/Zazai840/openstream.git
cd openstream
npm install
npm start
```

`npm install` does more than install JavaScript packages. It:

- compiles a pinned `whisper.cpp` revision with Metal support
- downloads and verifies the 141 MiB `ggml-base.en` model
- compiles the Swift hotkey and Accessibility helpers
- downloads and verifies `llama-server` and a roughly 1 GiB SmolLM2 model

The rewrite model files are prepared now. The app starts that server resident and uses it only for break placement during eligible long Dictations; it never rewrites dictated words.

To run the Vite renderer and Electron in development mode:

```bash
npm run dev
```

To create an unsigned DMG under `release/`:

```bash
npm run dist
```

There is no code signing or notarization yet. macOS may block the DMG until you explicitly allow it.

## First-run permissions

OpenStream needs three macOS permissions:

1. Microphone access for Electron.
2. Input Monitoring for the hotkey helper.
3. Accessibility for the text-insertion helper.

After granting Input Monitoring and Accessibility, quit and restart the app. Click a text field, hold `Control+Option+D`, speak, and release the keys. A cold start can take 15 to 20 seconds while `whisper-server` loads its Metal shaders.

Source runs can be attributed to Terminal, Electron, or OpenStream in System Settings. Permission identity across rebuilds is still being worked out.

## Design

- **Electron and React** provide the menu bar shell, hidden capture window, overlay, and renderer.
- **The transcription model server** is a pinned `whisper.cpp` build using `ggml-base.en`. Electron supervises it for the life of the app.
- **Rules cleanup** removes fillers, handles spoken punctuation, fixes a small technical vocabulary list, and segments long run-on text. It is deterministic and tested against a sub-millisecond budget.
- **The rewrite model server** uses `llama-server` with SmolLM2-1.7B-Instruct. It is resident while the app runs and handles paragraph break placement; explicit voice edits are planned, not available.
- **Native helpers** keep Input Monitoring and Accessibility in separate processes. A blocked Accessibility call cannot disable the global hotkey event tap.
- **The Dictation intake module** owns the completed-recording flow behind one interface. Transcription, Context detection, break placement, and delivery remain adapters; tray and Push-to-talk overlay state stays in the Electron shell.

See [CONTEXT.md](CONTEXT.md) for the project's terms, [ROADMAP.md](ROADMAP.md) for the longer plan, and [ADR-0001](docs/adr/0001-no-llm-in-the-dictation-path.md) for the cleanup decision.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

The global hotkey, macOS permission prompts, microphone capture, and insertion into other applications still need a real Mac and a human check. Run [`scripts/verify-dictation-pipeline.sh`](scripts/verify-dictation-pipeline.sh); the [manual-check notes](docs/testing/hotkey-transcribe-manual-check.md) explain what it measures.

## Project status

OpenStream is pre-alpha. The main slice works from source, but installation, permission handling, delivery recovery, and context-aware cleanup are unfinished. The app is not ready for everyday use or outside contributors yet.

Upstream issue history records most of the design work. Changes specific to this fork should target `Zazai840/openstream`, not the upstream repository.

## License

[MIT](LICENSE)
