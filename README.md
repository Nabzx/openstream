# OpenStream

> Working name — will likely change before v1.

A free, fully local, zero-setup voice dictation app for macOS — built specifically for developers.

## The problem

The best AI dictation tools today are genuinely good, but paid, metered, and cloud-based. Free and local alternatives exist too, so "local + free + no signup" alone isn't a gap anymore.

What's still missing: **dictation that knows what you're looking at.** Every existing tool treats every text field the same way — same formatting, same vocabulary, whether you're writing a Slack message, a terminal command, or a code comment.

## What OpenStream does differently

1. **Context-aware formatting** - detects the frontmost app/field via the macOS Accessibility API and adapts: no auto-capitalization or punctuation in a terminal, proper comment/docstring formatting in an editor, normal prose everywhere else.
   **Not in v0.x.** [Issue #44](https://github.com/Nabzx/openstream/issues/44) deferred per-app modes: v0.x formats everything as prose. Detection is reliable ([#28](https://github.com/Nabzx/openstream/issues/28) measured the frontmost app correct 10 of 10), but getting the text reliably into the field you are pointing at is the load-bearing problem and comes first. This remains the thesis, not the v0.x behaviour.
2. **Codebase-aware vocabulary** — reads identifiers, library names, and project-specific terms from the current git repo / open buffer and biases transcription toward them, so technical jargon and your own function/variable names actually transcribe correctly.
3. **Voice-driven editing, not just dictation** — select existing text anywhere and speak an edit command ("make this a bullet list", "snake_case that", "shorter") to rewrite it in place.
4. **Actually zero setup** — STT model and a small local LLM cleanup model ship bundled with the installer. No Ollama, no LM Studio, no manual model downloads, no config screens.

## Status

Early development — pre-alpha, no working build yet. Architecture below is the current plan and will evolve.

## Planned architecture

- **App shell**: Electron + React + TypeScript (Vite), menu bar tray app
- **Speech-to-text**: [whisper.cpp](https://github.com/ggml-org/whisper.cpp), prebuilt binary downloaded at build/first-run (not committed), run as a subprocess
- **Local LLM cleanup pass**: [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`) running **Llama 3.2 3B Instruct** (quantized GGUF, ~2GB), downloaded at build/first-run and called over local HTTP for formatting/editing/command-following. Meta built this size specifically for on-device rewriting/summarization, and it matches or beats Llama 3.1 8B on those tasks despite being under half the size. **Llama 3.2 1B** is offered as a lighter fallback for lower-RAM Macs via the model-size setting.
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
