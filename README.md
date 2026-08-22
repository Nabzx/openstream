# OpenStream

> Working name — will likely change before v1.

A free, fully local, zero-setup voice dictation app for macOS — built specifically for developers.

## The problem

The best AI dictation tools today are genuinely good, but paid, metered, and cloud-based. Free and local alternatives exist too, so "local + free + no signup" alone isn't a gap anymore.

What's still missing: **dictation that knows what you're looking at.** Every existing tool treats every text field the same way — same formatting, same vocabulary, whether you're writing a Slack message, a terminal command, or a code comment.

## What OpenStream does differently

1. **Context-aware formatting** — detects the frontmost app/field via the macOS Accessibility API and adapts: no auto-capitalization or punctuation in a terminal, proper comment/docstring formatting in an editor, normal prose everywhere else.
2. **Codebase-aware vocabulary** — reads identifiers, library names, and project-specific terms from the current git repo / open buffer and biases transcription toward them, so technical jargon and your own function/variable names actually transcribe correctly.
3. **Voice-driven editing, not just dictation** — select existing text anywhere and speak an edit command ("make this a bullet list", "snake_case that", "shorter") to rewrite it in place.
4. **No model wrangling** - the build fetches the speech-to-text model for you, at a pinned version, checksum-verified. No Ollama, no LM Studio, no account, no model picker, no config screens. Setup is a `git clone` and a build: v0.x is source-only, so you build it yourself.

## Status

Early development — pre-alpha, no working build yet. Architecture below is the current plan and will evolve.

## Planned architecture

- **App shell**: Electron + React + TypeScript (Vite), menu bar tray app
- **Speech-to-text**: [whisper.cpp](https://github.com/ggml-org/whisper.cpp), compiled from source at a pinned version during the build (not committed), run as a subprocess. There is no prebuilt macOS binary upstream, and the published `xcframework` is a static library that would require a native Node add-on in the Electron main process, which the helper-process design rules out. The `ggml-base.en.bin` model (141 MiB) is fetched by the build from a pinned Hugging Face revision and checked against a recorded SHA-256. One model, no size setting: it is the only model measured against the sub-1s latency budget.
- **Text cleanup**: deterministic rules, not a model. A local LLM was measured out of the dictation path: it cost seconds where rules cost well under a millisecond, and whisper.cpp already self-cleans the short clips where a model would be cheap.
- **Local LLM (Phase 3 only)**: [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`) is used only for **voice-driven editing**, where you explicitly ask for a rewrite and expect to wait. The model is **SmolLM2-1.7B-Instruct** (Apache 2.0, ungated, quantized GGUF, ~1 GB), chosen for a permissive licence and no gated download; the exact model is provisional pending an eval set. Nothing in v0.1 or v0.2 depends on it.
- **macOS native helpers**: small Swift/Objective-C binaries (compiled via native build scripts) for Accessibility API context detection, text injection, and mic access
- **Vocabulary biasing**: lightweight scan of open editor buffer / git repo for identifiers and terms, fed into whisper.cpp as an initial prompt / bias list

## Requirements

- Apple Silicon Mac (M1 or later)
- macOS 13+ (tentative, may adjust)
- Xcode Command Line Tools, to compile whisper.cpp and the native helpers
- A network connection for the build, which fetches the speech-to-text model

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the phased plan and task ownership.

## Contributing

This project is maintained by human contributors who are directly accountable for everything merged. AI tools may be used to assist with drafting, but every commit must be authored and reviewed by a human contributor — no AI co-authorship on commits or PRs.

Currently a two-person project. Open to outside contributions once there's a working MVP — issues and PRs welcome after that point.

## License

[MIT](LICENSE)
