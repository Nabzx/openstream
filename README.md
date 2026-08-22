# OpenStream

> Working name — will likely change before v1.

A free, fully local, zero-setup voice dictation app for macOS — built specifically for developers.

## The problem

The best AI dictation tools today are genuinely good, but paid, metered, and cloud-based. Free and local alternatives exist too, so "local + free + no signup" alone isn't a gap anymore.

What's still missing: **dictation that knows what you're looking at.** Every existing tool treats every text field the same way — same formatting, same vocabulary, whether you're writing a Slack message, a terminal command, or a code comment.

## What OpenStream does differently

1. **Context-aware dictation** - detects the frontmost app via the macOS Accessibility API. Text is cleaned the same way everywhere; what changes by app is where it is *safe* to insert a line break, because in a terminal or a chat window Enter submits and a stray break would send half a sentence. In apps where breaks are safe, a small local model decides where paragraphs belong in long dictation. (Earlier drafts promised terminal-specific and editor-specific formatting. That was dropped in #45: dictation into a terminal is dictation into tools like Claude Code, which want ordinary prose.)
2. **Codebase-aware vocabulary** — reads identifiers, library names, and project-specific terms from the current git repo / open buffer and biases transcription toward them, so technical jargon and your own function/variable names actually transcribe correctly.
3. **Voice-driven editing, not just dictation** — select existing text anywhere and speak an edit command ("make this a bullet list", "snake_case that", "shorter") to rewrite it in place.
4. **Build it once, then nothing to set up** — there is no installer and no bundled model. You build from source, and the build compiles whisper.cpp and fetches its model for you. After that: no Ollama, no LM Studio, no manual model downloads, no first-run downloader, no config screens.

## Status

Early development — pre-alpha, no working build yet. Architecture below is the current plan and will evolve.

## Planned architecture

- **App shell**: Electron + React + TypeScript (Vite), menu bar tray app
- **Speech-to-text**: [whisper.cpp](https://github.com/ggml-org/whisper.cpp), **compiled from source at a pinned tag during the build** - upstream publishes no macOS arm64 CLI binary, and a compiler is already required for the native helpers. One model, `ggml-base.en.bin` (141 MiB), fetched during the build from a **pinned Hugging Face revision** and verified against a known SHA-256; the build fails loudly if it does not match. Neither the binary nor the model is committed. Run as a resident `whisper-server` supervised for the life of the app.
- **Text cleanup**: a **deterministic rules engine**, not a model. Filler removal, punctuation and per-mode formatting cost 0.1-1.0 ms. **There is no LLM in the dictation path** - measurement showed whisper already self-cleans short clips, so a model only earned its keep on exactly the long inputs where it cost seconds.
- **Local rewrite model (Phase 3 only)**: [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`), used solely for voice-driven editing, where the user explicitly asks for a rewrite and expects to wait. It starts lazily on first use and is released after 5 minutes idle. The model must be **Apache 2.0 or MIT and ungated** (no account, no terms acceptance): **SmolLM2-1.7B-Instruct** provisionally, Qwen3-1.7B the alternate. How it is acquired is still open.
- **macOS native helpers**: small Swift/Objective-C binaries (compiled via native build scripts) for Accessibility API context detection, text injection, and mic access
- **Vocabulary biasing**: lightweight scan of open editor buffer / git repo for identifiers and terms, fed into whisper.cpp as an initial prompt / bias list

## Requirements

- Apple Silicon Mac (M1 or later)
- macOS 13+ (tentative, may adjust)

## Roadmap

See [ROADMAP.md](ROADMAP.md) for the phased plan and task ownership.

## Contributing

This project is maintained by human contributors who are directly accountable for everything merged. AI tools may be used to assist with drafting, but every commit must be authored and reviewed by a human contributor — no AI co-authorship on commits or PRs.

Currently a two-person project. Open to outside contributions once there's a working MVP — issues and PRs welcome after that point.

## License

[MIT](LICENSE)
