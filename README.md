# OpenStream

OpenStream is a local-first voice dictation app for Apple Silicon Macs, built for developers. Hold a key, speak, release — the text lands in whatever app is frontmost. Audio and every model request stay on the machine.

Its one firm opinion: **a spoken line break is denied by default.** A newline can submit a half-typed terminal command or send an unfinished chat message, so OpenStream checks the frontmost app and the focused field before it turns "new paragraph" into a real break. It only survives in apps you have allow-listed.

## Features

- **Push-to-talk dictation** on a key you choose — standalone `Option` (default), `Command`, `Control`, `Fn`, `Caps Lock`, or `F1`–`F19`. Hold, speak, release; the transcript is placed at the cursor.
- **Deny-by-default on line breaks** — a spoken break becomes a real newline only in break-safe apps; everywhere else the words run on. The allow-list is editable in Settings.
- **Deterministic cleanup** — fillers, spoken punctuation, false starts and run-on segmentation are handled by a rules engine, not a model. No LLM rewrites your words. Sub-millisecond.
- **Voice edits** — select text, hold the key, and speak a command from a fixed set: `snake case`, `camel case`, `wrap in backticks`, `bullet list`, and more. Pure string transforms, instant.
- **`Escape` to cancel** a recording mid-flight — the audio is discarded, nothing is transcribed.
- **Nothing leaves the machine** — `whisper.cpp` transcribes locally; a small local model places paragraph breaks in long dictations (sentence indices only, never text). No account, no cloud, no telemetry.
- **A real desktop window** — Home and Settings, follows the system light/dark setting, opens on a Permissions screen if a grant is missing.
- **Launch at login** — starts hidden in the menu bar.

Planned, not yet in the app: codebase-vocabulary biasing (transcription weighted toward your project's identifiers), and semantic voice edits ("make this shorter") once a capable local model fills the rewrite role.

## Install

OpenStream installs from source. There is a convenience DMG on the [releases page](https://github.com/Nabzx/openstream/releases), but it is unsigned — Gatekeeper will warn, and every rebuild resets the macOS permission grants (see below) — so `git clone` is the supported path.

### Requirements

- Apple Silicon Mac, macOS 13 or newer
- Node.js 22.12 or newer
- Xcode Command Line Tools
- CMake, Git, and curl
- A network connection during install, for the model and server downloads

```bash
git clone https://github.com/Nabzx/openstream.git
cd openstream
npm install
npm start
```

`npm install` does more than fetch JavaScript packages. It:

- compiles a pinned `whisper.cpp` revision with Metal support
- downloads and verifies the 141 MiB `ggml-base.en` transcription model
- compiles the Swift hotkey and Accessibility helpers
- downloads and verifies `llama-server` and a roughly 1 GiB SmolLM2 model for break placement

Development mode (Vite renderer + Electron):

```bash
npm run dev
```

Unsigned DMG under `release/`:

```bash
npm run dist
```

### Releases

Pushing a `v*` tag runs [`.github/workflows/release.yml`](.github/workflows/release.yml): it builds an unsigned arm64 DMG and publishes a GitHub release with the tag annotation as the notes. A hyphenated tag (`v1.1.0-rc.1`) publishes as a pre-release. Code signing, notarisation, and a Homebrew cask wait on the signed-distribution decision ([#11](https://github.com/Nabzx/openstream/issues/11)); until then the DMG is a convenience download and `git clone` is the real install.

## First-run permissions

OpenStream needs three macOS permissions:

1. **Microphone** — for Electron to hear you. macOS prompts the first time you dictate.
2. **Input Monitoring** — for the hotkey helper to see the push-to-talk key.
3. **Accessibility** — for the helper that places text at the cursor.

On launch the app checks these: if Accessibility or Input Monitoring is missing it opens on a **Permissions** screen with a link straight to each System Settings pane. `npm run doctor` runs the same check from the terminal.

After granting Input Monitoring and Accessibility, **quit and restart the app** so it picks up the change. Then click a text field, hold your key, speak, and release. Fn and Caps Lock depend on keyboard support and may not produce a usable event. A cold start takes 15–20 seconds while `whisper-server` loads its Metal shaders.

**Because OpenStream runs from source, every rebuild resets the grants** — ad-hoc signing has no stable identity, so macOS re-keys the permission to the new binary. When you re-grant, **remove the old OpenStream entry in System Settings first**, then add the new build; macOS won't let a stale entry and a fresh one coexist.

## Startup

- The menu bar icon appears immediately. The window opens on first run, from **Open Window** in the tray, or on a Dock-icon click.
- Both model servers start resident at launch and stay up for the app's life — the `whisper-server` Metal warm-up happens once, not per dictation.
- **Launch at login** (Settings → Startup) opens OpenStream hidden, straight to the menu bar. Model-server start is held back a few seconds so the warm-up doesn't fight the rest of login.
- Closing the window backgrounds the app. Quit from the tray, the app menu, or `⌘Q`.

## How it works

- **Electron + React** — the menu bar shell, the hidden capture window, the push-to-talk overlay, and the desktop window.
- **Transcription model server** — a pinned `whisper.cpp` build on `ggml-base.en`, supervised for the life of the app.
- **Rules cleanup** — deterministic: fillers, spoken punctuation, a small technical vocabulary, run-on segmentation. Tested against a sub-millisecond budget. See [ADR-0001](docs/adr/0001-no-llm-in-the-dictation-path.md) and [ADR-0002](docs/adr/0002-no-one-model-dictation-engine.md).
- **Rewrite model server** — `llama-server` with SmolLM2-1.7B, resident, used only to place paragraph breaks in eligible long dictations. It returns sentence numbers, never text.
- **Native helpers** — Input Monitoring and Accessibility live in separate Swift processes. A blocked Accessibility call cannot take down the global hotkey.
- **The dictation intake module** owns the completed-recording flow behind one interface; transcription, context detection, break placement, and delivery are adapters behind it.

See [CONTEXT.md](CONTEXT.md) for the project's vocabulary, [ROADMAP.md](ROADMAP.md) for the plan, and [docs/progress/](docs/progress/) for dated engineering checkpoints — most recent first: [phase-4](docs/progress/phase-4-progress.md), [phase-3](docs/progress/phase-3-progress.md), [phase-2](docs/progress/phase-2-progress.md), [phase-1](docs/progress/phase-1-progress.md).

## Tests

```bash
npm test
npm run typecheck
npm run build
```

The global hotkey, macOS permission prompts, microphone capture, and insertion into other apps need a real Mac and a human. The checklists in [docs/testing/](docs/testing/) cover the end-to-end dictation pass, the shortcut matrix, voice edits, IDE-terminal dictation, and the break-safe apps setting.

## Status

Feature-complete for 1.0. The pipeline, the settings UI, the permissions gate, and release automation are all in place; the final on-device verification pass ([#228](https://github.com/Nabzx/openstream/issues/228)) is what stands between here and the `v1.0.0` tag.

## License

[MIT](LICENSE)
