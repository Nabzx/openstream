# Roadmap

Two contributors, working in parallel, shipping something usable at every phase. The strategy: build one thin vertical slice together first so the foundation is shared, then split into two independent tracks that rarely touch the same files, so neither of you blocks the other. Each phase ends in a tagged, runnable build — not just merged code.

Pick who owns which track in Phase 2 based on interest, not this doc — the split is designed to be swappable.

## Ground rules

- Every PR is reviewed by the other person before merge — no self-merges. This is what "human devs held accountable" means in practice.
- Every phase ends with a tagged build (`v0.1`, `v0.2`, ...) that actually runs, even if narrow. Don't let a phase balloon past its goal.
- If a track's task is blocked or boring, swap — don't stall.

---

## Phase 0 — Bootstrap (both, together, target: 2-3 days)

Get to "clone and build" for both of you before splitting up.

- [ ] Electron + React + TypeScript (Vite) scaffold, menu bar tray app shell (no functionality yet)
- [ ] whisper.cpp integrated: download script for the prebuilt binary + a model, subprocess wrapper, one hardcoded hotkey triggers record → transcribe → print to console
- [ ] GitHub Actions workflow: build check on every PR
- [ ] Branch protection on `main`: PRs required, one review required

**Definition of done:** both of you can `git clone`, `npm install`, hit a hotkey, and see transcribed text in the console.

---

## Phase 1 — v0.1: "It types" (both, split trivially, target: ~1 week)

- [ ] Global push-to-talk hotkey handling via native macOS helper binary (**Person A**)
- [ ] Text injection at cursor via native Accessibility API helper (**Person B**)
- [ ] Menu bar tray icon states: idle / recording / transcribing (either)

**Definition of done:** a DMG that lets anyone dictate plain text into any app. No context-awareness yet, no LLM cleanup yet — but it's a real, usable, shippable tool. Tag `v0.1`.

---

## Phase 2 — v0.2: Split into two tracks (target: 2-3 weeks)

### Track A — Input & Delivery
Owns: audio capture, STT, text delivery, packaging.

- [ ] Download pipeline for whisper.cpp binary + models, run at build/first-launch with progress UI
- [ ] Support multiple whisper.cpp model sizes; settings toggle for speed vs. accuracy
- [ ] Harden text injection across app types — this breaks in Electron apps, terminals, and some Java/Swing apps; needs real cross-app testing
- [ ] Code signing + notarization, Homebrew cask, `electron-updater` auto-update

### Track B — Intelligence
Owns: reliable injection, prose cleanup.

**Re-scoped by [#44](https://github.com/Nabzx/openstream/issues/44):** per-app modes are deferred. v0.x formats everything as prose, and the load-bearing problem is getting the text into the field the user is pointing at.

- [ ] Accessibility API: native helper resolves the focused element so text can be put into it ([#12](https://github.com/Nabzx/openstream/issues/12)). No mode reporting
- [ ] Decide and build the injection mechanism, its guard against a stale target, and what the user sees when it fails ([#62](https://github.com/Nabzx/openstream/issues/62))
- [ ] Prose cleanup rules engine: filler removal, stutter collapse, spoken punctuation, capitalisation, run-on segmentation ([#13](https://github.com/Nabzx/openstream/issues/13)). One path, no per-mode dispatch
- [ ] llama.cpp integration: download `llama-server` + Llama 3.2 3B Instruct (quantized GGUF), get a basic cleanup pass running (filler removal, punctuation) over local HTTP. Offer Llama 3.2 1B as a lighter fallback for lower-RAM Macs
- [ ] Prompt design + a small eval set to judge cleanup quality before/after changes

**Definition of done:** Track A ships more reliable, faster, easier-to-install dictation. Track B ships visibly smarter output. Tag `v0.2`.

---

## Phase 3 — v0.3: Deepen (target: 3-4 weeks)

Same tracks, harder problems — this is where it gets genuinely complex.

- **Track A:** codebase vocabulary scanner — extract identifiers/terms from the open git repo or editor buffer, feed them into whisper.cpp as an initial prompt / bias list
- **Track B:** voice-driven editing — select existing text anywhere, speak a command ("make this a bullet list", "snake_case that"), send it to `llama-server` to rewrite the selection in place

**Definition of done:** dictation that's measurably more accurate on your own codebase's vocabulary, plus voice-editing of existing text. Tag `v0.3`.

---

## Phase 4 — v1.0: Polish & launch (both, target: 1-2 weeks)

- [ ] Onboarding flow — mic + Accessibility permission walkthrough
- [ ] Settings UI complete (hotkey remapping, model choice, cleanup rules)
- [ ] Release automation (GitHub Releases + Homebrew formula bump on tag, `electron-builder` pipeline)
- [ ] README demo GIF, short landing page
- [ ] Public launch (Show HN, r/macapps, etc.)

**Definition of done:** something you'd hand to a stranger without caveats. Tag `v1.0`.

---

## After v1.0

Open to outside contributors. Backlog candidates: Linux/Windows ports, per-project config files, custom wake-word-free modes, team-shared vocabulary packs. Not scoped yet — revisit after launch feedback.
