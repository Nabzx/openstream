# OpenStream

OpenStream is a local-first voice dictation app for Apple Silicon Macs. Hold a global hotkey, speak, then release it to place the transcript in the frontmost application. Audio and model requests stay on the Mac.

This repository is a development fork of [Nabzx/openstream](https://github.com/Nabzx/openstream). It now contains a runnable dictation path, an unsigned DMG build, and the start of a stricter coordinator for the next version. There is no published, signed release yet.

## What works

The current app can:

- run as a macOS menu bar app
- listen for `Cmd+Shift+D` through a native hotkey helper
- record while the hotkey is held and transcribe after release
- keep `whisper-server` resident instead of loading it for each dictation
- insert text at the cursor through a separate Accessibility helper
- fall back from direct field writes to clipboard paste or synthesized keystrokes
- show recording and transcription state in the tray, plus a small recording overlay
- build an unsigned Apple Silicon DMG with `npm run dist`

The repository also has tested rules cleanup and a TypeScript dictation coordinator. The coordinator covers context lookup, one-line fields, break-safe applications, paragraph break replies, held delivery, and failure states. That newer path is not wired into the Electron main process yet, so the runnable app still inserts the direct transcription result.

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
- Node.js 20
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

The rewrite model files are prepared now, but the app does not start that server or use it during dictation.

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

After granting Input Monitoring and Accessibility, quit and restart the app. Click a text field, hold `Cmd+Shift+D`, speak, and release the keys. A cold start can take 15 to 20 seconds while `whisper-server` loads its Metal shaders.

Development builds can appear in System Settings as Electron rather than OpenStream. Permission identity across rebuilds is still being worked out.

## Design

- **Electron and React** provide the menu bar shell, hidden capture window, overlay, and renderer.
- **The transcription model server** is a pinned `whisper.cpp` build using `ggml-base.en`. Electron supervises it for the life of the app.
- **Rules cleanup** removes fillers, handles spoken punctuation, fixes a small technical vocabulary list, and segments long run-on text. It is deterministic and tested against a sub-millisecond budget.
- **The rewrite model server** uses `llama-server` with SmolLM2-1.7B-Instruct. Its files and supervisor exist, but it is not connected to the app. The intended jobs are paragraph break placement and explicit voice edits, not rewriting every dictation.
- **Native helpers** keep Input Monitoring and Accessibility in separate processes. A blocked Accessibility call cannot disable the global hotkey event tap.
- **The dictation coordinator** defines the newer end-to-end flow and keeps model, context, delivery, and UI adapters behind one interface.

See [CONTEXT.md](CONTEXT.md) for the project's terms, [ROADMAP.md](ROADMAP.md) for the longer plan, and [ADR-0001](docs/adr/0001-no-llm-in-the-dictation-path.md) for the cleanup decision.

## Tests

```bash
npm test
npm run typecheck
npm run build
```

The global hotkey, macOS permission prompts, microphone capture, and insertion into other applications still need a real Mac and a human check. The steps live in [docs/testing/hotkey-transcribe-manual-check.md](docs/testing/hotkey-transcribe-manual-check.md).

## Project status

OpenStream is pre-alpha. The main slice works from source, but installation, permission handling, delivery recovery, context-aware cleanup, and the newer coordinator integration are unfinished. The app is not ready for everyday use or outside contributors yet.

Upstream issue history records most of the design work. Changes specific to this fork should target `Zazai840/openstream`, not the upstream repository.

## License

[MIT](LICENSE)
