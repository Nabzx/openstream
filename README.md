# OpenStream

OpenStream is a local-first voice dictation app for Apple Silicon Macs. Hold a global hotkey, speak, then release it to place the transcript in the frontmost application. Audio and model requests stay on the Mac.

This repository is a development fork of [Nabzx/openstream](https://github.com/Nabzx/openstream). It now contains a runnable dictation path, an unsigned DMG build, and a tested completed-Dictation intake module. There is no published, signed release yet.

## What works

The current app can:

- run as a macOS menu bar app
- listen for standalone `Option`, `Command`, `Control`, `Fn`, or `Caps Lock` through a native hotkey helper when macOS exposes the key
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

### Releases

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): it builds an unsigned arm64 DMG and publishes a GitHub release, using the tag's annotation as the notes. The DMG is a convenience download — Gatekeeper will warn on it (right-click → Open, or allow it in System Settings). The supported install is still `git clone` + `npm install`; a Homebrew formula waits on the signed-distribution decision ([#11](https://github.com/Nabzx/openstream/issues/11)).

There is no code signing or notarization yet. macOS may block the DMG until you explicitly allow it.

## First-run permissions

OpenStream needs three macOS permissions:

1. Microphone access for Electron.
2. Input Monitoring for the hotkey helper.
3. Accessibility for the text-insertion helper.

After granting Input Monitoring and Accessibility, quit and restart the app. Click a text field, hold the configured standalone key, speak, and release it. Press `Escape` while the key is held to abort a recording without inserting anything. Existing saved combinations such as `Control+Option+D` remain usable until changed. Fn and Caps Lock depend on keyboard support and may not produce a usable event. A cold start can take 15 to 20 seconds while `whisper-server` loads its Metal shaders.

On launch the app checks these grants: if Accessibility or Input Monitoring is missing it opens on a **Permissions** screen with links straight to the right System Settings pane. `npm run doctor` runs the same check from the terminal.

**Because OpenStream runs from source, every rebuild resets the grants** (ad-hoc signing has no stable identity, so macOS re-keys the permission to the new binary). When you re-grant, **remove the old OpenStream entry in System Settings first**, then add the new build — macOS won't let a stale entry and a fresh one coexist.

Source runs can be attributed to Terminal, Electron, or OpenStream in System Settings. Permission identity across rebuilds is still being worked out.

## Startup

- The menu bar icon appears immediately. The window opens only on the very first run, or when you pick **Open Window** from the tray / click the Dock icon.
- Both model servers start resident at launch and stay up for the app's life — the `whisper-server` Metal warm-up (15–20 s) happens once, not per dictation.
- **Launch at login** (Settings → Startup) opens OpenStream hidden — straight to the menu bar, no window. Model-server start is held back a few seconds so the warm-up doesn't fight everything else macOS is doing at login.
- Closing the window backgrounds the app. Quit from the tray, the app menu, or `⌘Q`.

## Design

- **Electron and React** provide the menu bar shell, hidden capture window, overlay, and renderer.
- **The transcription model server** is a pinned `whisper.cpp` build using `ggml-base.en`. Electron supervises it for the life of the app.
- **Rules cleanup** removes fillers, handles spoken punctuation, fixes a small technical vocabulary list, and segments long run-on text. It is deterministic and tested against a sub-millisecond budget.
- **The rewrite model server** uses `llama-server` with SmolLM2-1.7B-Instruct. It is resident while the app runs and handles paragraph break placement; explicit voice edits are planned, not available.
- **Native helpers** keep Input Monitoring and Accessibility in separate processes. A blocked Accessibility call cannot disable the global hotkey event tap.
- **The Dictation intake module** owns the completed-recording flow behind one interface. Transcription, Context detection, break placement, and delivery remain adapters; tray and Push-to-talk overlay state stays in the Electron shell.

See [CONTEXT.md](CONTEXT.md) for the project's terms, [ROADMAP.md](ROADMAP.md) for the longer plan, and the ADRs for the pipeline decisions: [ADR-0001](docs/adr/0001-no-llm-in-the-dictation-path.md) (cleanup is rules-only) and [ADR-0002](docs/adr/0002-no-one-model-dictation-engine.md) (dictation stays a transcription stage plus deterministic cleanup, not one model). For a full walkthrough of the architecture, the trade-offs behind it, and where the project actually stands against the roadmap, see [docs/progress/](docs/progress/) - a dated checkpoint per phase, most recent first: [phase-3-progress.md](docs/progress/phase-3-progress.md), [phase-2-progress.md](docs/progress/phase-2-progress.md), [phase-1-progress.md](docs/progress/phase-1-progress.md).

## Tests

```bash
npm test
npm run typecheck
npm run build
```

The global hotkey, macOS permission prompts, microphone capture, and insertion into other applications still need a real Mac and a human check. Run [`scripts/verify-dictation-pipeline.sh`](scripts/verify-dictation-pipeline.sh); the [pipeline notes](docs/testing/hotkey-transcribe-manual-check.md) explain what it measures. The [shortcut verification notes](docs/testing/settings-hotkey-remap-manual-check.md) contain the conditional-key matrix and replacement checks.

## Project status

OpenStream is pre-alpha. The main slice works from source, but installation, permission handling, delivery recovery, and context-aware cleanup are unfinished. The app is not ready for everyday use or outside contributors yet.

Upstream issue history records most of the design work. Changes specific to this fork should target `Zazai840/openstream`, not the upstream repository.

## License

[MIT](LICENSE)
