<div align="center">

# OpenStream

![macOS 14+](https://img.shields.io/badge/macOS-14%2B-0b0f14?logo=apple&logoColor=white)
&nbsp;![Apple Silicon](https://img.shields.io/badge/Apple_Silicon-arm64-0b0f14)
&nbsp;![Licence: MIT](https://img.shields.io/badge/licence-MIT-3B9EFF)
&nbsp;![Status: beta](https://img.shields.io/badge/status-beta-3B9EFF)

Local-first voice dictation for developers. Hold a key, talk, let go.<br>
The words land at your cursor and never leave your Mac.

</div>

<img src="assets/readme-banner.png" alt="OpenStream" width="100%">

<img src="assets/demo.gif" alt="Dictating into Apple Notes: spoken text, a spoken paragraph break, spoken bullet points, and a voice edit that uppercases and quotes a selection." width="100%">

## Why

Wispr Flow is good, but it wants a subscription and an account, and your voice goes to their servers. OpenStream does the same job for free, on your Mac, with no sign-up.

It also tries not to break your flow. Before it types a line break it checks which app you are in, so saying "new paragraph" cannot fire off a half-typed command or send an unfinished message.

## Install

From source, which is the supported path:

```bash
git clone https://github.com/Nabzx/openstream.git
cd openstream && npm install && npm start
```

You need Apple Silicon, macOS 14 or newer, Node 22.12+ and the Xcode command line tools. `npm install` builds three Swift helpers, so the first run is slow. The transcription model (about 470 MB) downloads the first time you open the app.

There is an unsigned beta DMG on the [releases page](https://github.com/Nabzx/openstream/releases), but Gatekeeper will complain and a rebuild wipes the permissions, so building from source is the better route.

## Permissions

macOS makes you allow three things, once: Microphone, Input Monitoring and Accessibility. The app tells you on launch if any are missing, or run `npm run doctor`. Grant them, quit, reopen.

Rebuilding the app resets these grants, so delete the old OpenStream under System Settings > Privacy & Security before adding the new one.

## How it works

- Parakeet (NVIDIA), via FluidAudio, transcribes on the Neural Engine and stays loaded for the life of the app.
- A deterministic rules engine tidies the text. No model rewrites your words ([ADR-0001](docs/adr/0001-no-llm-in-the-dictation-path.md)).
- A small local model decides where paragraph breaks go in long dictations. It returns sentence numbers, never text.
- The hotkey and the text injection run as separate Swift processes, so a stuck Accessibility call cannot take the shortcut down with it.

## Status

Beta, feature-complete for 1.0. A final on-device verification pass ([#228](https://github.com/Nabzx/openstream/issues/228)) is what stands between here and the `v1.0.0` tag.

## Development

```bash
npm run dev      # Vite renderer + Electron
npm test         # unit tests
npm run dist     # unsigned DMG under release/
```

More: [ROADMAP](ROADMAP.md), [CONTEXT](CONTEXT.md), [progress notes](docs/progress/).

## Licence

[MIT](LICENSE)
