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
- [ ] whisper.cpp integrated: build script **compiles whisper.cpp from source at a pinned tag** and fetches `ggml-base.en.bin` from a **pinned Hugging Face revision**, SHA-256 verified (no prebuilt macOS arm64 binary is published - see #30), **resident `whisper-server` started at app launch and supervised for the life of the app** (not a per-dictation subprocess - see #29), one hardcoded hotkey triggers record → transcribe → print to console
- [ ] GitHub Actions workflow: build check on every PR
- [ ] Branch protection on `main`: PRs required, one review required

**Definition of done:** both of you can `git clone`, `npm install`, hit a hotkey, and see transcribed text in the console.

---

## Phase 1 — v0.1: "It types" (both, split trivially, target: ~1 week)

- [ ] Global push-to-talk hotkey handling via native macOS helper binary (**Person A**)
- [ ] Text injection at cursor via native Accessibility API helper (**Person B**)
- [ ] Menu bar tray icon states: idle / recording / transcribing (either)
- [ ] Push-to-talk overlay shows a **live sound level** while the key is held - **added by #31.** Provisional text is never shown and never injected; the level is the only in-dictation feedback, because the user is looking at the target app rather than reading
- [ ] Audio capture feeds the transcription model server **in parts during speech**, not one file at key release - **added by #31**, so the latency budget pays for the final part only. Assumption under test in #76; if it fails, whole-recording capture is the fallback. Also a new requirement on #33

**Definition of done:** a DMG that lets anyone dictate plain text into any app. No context-awareness yet, no LLM cleanup yet — but it's a real, usable, shippable tool. Tag `v0.1`.

---

## Phase 2 — v0.2: Split into two tracks (target: 2-3 weeks)

### Track A — Input & Delivery
Owns: audio capture, STT, text delivery, packaging.

- [ ] Harden the build-time compile + model fetch: cached artifacts, re-verification on rebuild, loud failure messages. **No first-launch download and no progress UI** - #30 moved model acquisition entirely into the build
- [ ] ~~Support multiple whisper.cpp model sizes; settings toggle for speed vs. accuracy~~ - **removed by #30.** One model, `ggml-base.en.bin`. The setting existed so low-RAM Macs could dodge the 2 GB LLM, and that LLM left the dictation path in #24; `small.en` is ~3x the work and would put long dictations past the sub-1s budget
- [ ] Harden text injection across app types — this breaks in Electron apps, terminals, and some Java/Swing apps; needs real cross-app testing
- [ ] Decide the injection mechanism itself, its guard against a stale target, and what the user sees when injection fails ([#62](https://github.com/Nabzx/openstream/issues/62)). The hardening item above assumes a mechanism that has never been chosen
- [ ] Code signing + notarization, Homebrew cask, `electron-updater` auto-update

### Track B — Intelligence
Owns: context awareness, prose cleanup rules, break safety.

- [ ] Accessibility API: native helper detects the frontmost app + focused field type. **No discrete modes** - #45 deleted terminal mode and editor mode, and #44 closed as invalidated on the same finding. What detection feeds is a break-safe allow-list keyed on bundle id, plus a one-line-field modifier from the AX role
- [ ] One prose rules-cleanup profile applied to every dictation, plus two modifiers (one-line field; break-safe app). Break placement in long dictation is asked of the **rewrite model server**, which answers with sentence numbers and never with text - see #45, #13, #67. **Unresolved ordering conflict:** break placement needs the `llama-server` plumbing listed in Phase 3 below, so either that moves up into Phase 2 or break placement ships in v0.3 and Phase 2 ends with rules-only cleanup
- [ ] Prompt design + a small eval set to judge rewrite quality before/after changes

**Definition of done:** Track A ships more reliable, faster, easier-to-install dictation. Track B ships visibly smarter output. Tag `v0.2`.

---

## Phase 3 — v0.3: Deepen (target: 3-4 weeks)

Same tracks, harder problems — this is where it gets genuinely complex.

- **Track A:** codebase vocabulary scanner — extract identifiers/terms from the open git repo or editor buffer, feed them into whisper.cpp as an initial prompt / bias list
- **Track B:** `llama-server` plumbing - fetch the binary and an **Apache 2.0 / MIT, ungated** GGUF (SmolLM2-1.7B-Instruct provisionally; acquisition policy open in #52), start it, confirm a local HTTP round trip (moved here from Phase 2 by #24 and #32)
- **Track B:** voice-driven editing — select existing text anywhere, speak a command ("make this a bullet list", "snake_case that"), send it to the **rewrite model server** to rewrite the selection in place. **Correction from #45:** that server is now **resident**, started at app launch alongside the transcription model server, because it also decides break placement during ordinary dictation. The lazy-then-idle-released lifecycle #29 chose assumed it served voice edits only

**Definition of done:** dictation that's measurably more accurate on your own codebase's vocabulary, plus voice-editing of existing text. Tag `v0.3`.

---

## Phase 4 — v1.0: Polish & launch (both, target: 1-2 weeks)

- [ ] Permission state check - build script warns when a helper hash changes, app tests all three grants at launch and blocks on Accessibility / Input Monitoring (#47)
- [ ] Settings UI complete (hotkey remapping, the user-editable break-safe app list) - **no mode rules** (#45) and **no model choice** (#30)
- [ ] Release automation (GitHub Releases + Homebrew formula bump on tag, `electron-builder` pipeline)
- [ ] README demo GIF, short landing page
- [ ] Public launch (Show HN, r/macapps, etc.)

**Definition of done:** something you'd hand to a stranger without caveats. Tag `v1.0`.

---

## After v1.0

Open to outside contributors. Backlog candidates: Linux/Windows ports, per-project config files, custom wake-word-free modes, team-shared vocabulary packs. Not scoped yet — revisit after launch feedback.
