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

### Track B — Intelligence
Owns: context awareness, prose cleanup rules, break safety.

- [ ] Accessibility API: native helper detects the frontmost app + focused field type. **No discrete modes** - #45 deleted terminal mode and editor mode, and #44 closed as invalidated on the same finding. What detection feeds is a break-safe allow-list keyed on bundle id, plus a one-line-field modifier from the AX role
- [ ] One prose rules-cleanup profile applied to every dictation, plus two modifiers (one-line field; break-safe app). Break placement in long dictation is asked of the **rewrite model server**, which answers with sentence numbers and never with text - see #45, #13, #67. **Unresolved ordering conflict:** break placement needs the `llama-server` plumbing listed in Phase 3 below, so either that moves up into Phase 2 or break placement ships in v0.3 and Phase 2 ends with rules-only cleanup
- [ ] Prompt design + a small eval set to judge rewrite quality before/after changes

**Definition of done:** Track A ships more reliable, faster, easier-to-install dictation. Track B ships visibly smarter output. Tag `v0.2`.

---

## Phase 3 — v0.3: Deepen — **done, tagged `v0.3`**

Same tracks, harder problems — this is where it got genuinely complex.

- ~~**Track A:** codebase vocabulary scanner~~ - **moved to the After-v1.0 backlog.** Built and unit-tested (#16, PR #185), but deprioritised - an MVP needs plain dictation working excellently first. The Settings UI is unhooked, not deleted; the scanning/caching/pipeline wiring stays in place.
- **Track B:** `llama-server` plumbing - **done** (folded into the break-placement work already shipped in Phase 2).
- **Track B:** voice-driven editing — **shipped as a deterministic spoken-command transform layer** (#17, PR #225). The [#222](https://github.com/Nabzx/openstream/issues/222) spike measured SmolLM2-1.7B failing to follow a rewrite instruction reliably (returned the selection unchanged 6-7/15, or with an example did the wrong transform), and the commands it *did* handle - case conversions, wraps - are pure string transforms that need no model. So v0.3 ships those deterministically, no rewrite model call; semantic commands ("shorter", "fix grammar") are deferred behind a better model in the rewrite role (#222, → Phase 4).
- **Track B:** #173 (IDE-terminal app-switch tracking) — **fixed** (#226). The notification observer was on a run loop the helper never pumps; replaced with a direct poll.
- **Pulled forward from Phase 4:** the desktop app UI — a resizable, navigable window (Home + Settings, toolbar tabs, a design-token layer, an application menu, regular Dock app). Designed on the [#206](https://github.com/Nabzx/openstream/issues/206) map, built in #212/#220.

**Definition of done:** voice editing of existing text, working — the deterministic subset ships. **Manual verification** (the voice-edit matrix, IDE-terminal dictation, the end-to-end dictation pass) is deliberately deferred to a single pre-launch pass ([#228](https://github.com/Nabzx/openstream/issues/228)) rather than gating the tag. `v0.3` tagged at the feature-complete point.

See [docs/progress/phase-3-progress.md](docs/progress/phase-3-progress.md) for the full checkpoint.

---

## Phase 4 — v1.0: Polish & launch (both, target: 1-2 weeks)

- [x] **Permission state check** — the app probes all three grants at launch (functionally, since a System Settings toggle can read ON while the binary is denied) and blocks on Accessibility / Input Monitoring, opening on a Permissions screen; `npm run doctor` runs the same check from the terminal ([#47](https://github.com/Nabzx/openstream/issues/47)). The rebuild/TCC-identity problem ([#46](https://github.com/Nabzx/openstream/issues/46), [#88](https://github.com/Nabzx/openstream/issues/88)) is documented, not solved — it is a source-only fact of life.
- [x] **Settings UI complete** — hotkey remapping (Zazai's [#218](https://github.com/Nabzx/openstream/issues/218)), the user-editable break-safe app list with a native app picker ([#19](https://github.com/Nabzx/openstream/issues/19)), and launch-at-login ([#135](https://github.com/Nabzx/openstream/issues/135)). No mode rules ([#45](https://github.com/Nabzx/openstream/issues/45)), no model choice ([#30](https://github.com/Nabzx/openstream/issues/30)).
- [x] **Release automation** — a `v*` tag builds an unsigned arm64 DMG and cuts a GitHub release; hyphenated tags publish as pre-releases ([#20](https://github.com/Nabzx/openstream/issues/20), proven end to end with a `v0.4.0-rc.1` dry run). No Homebrew bump yet — that waits on signing.
- [x] **Window redesign** — the desktop window got a real visual pass: refreshed tokens, an app mark, a calmer Home page, a proper Permissions gate screen, live dictation activity ([#242](https://github.com/Nabzx/openstream/issues/242), and the app/menu-bar icons in [#244](https://github.com/Nabzx/openstream/issues/244)).
- [x] **Track-A pipeline fixes** — Escape-to-cancel ([#134](https://github.com/Nabzx/openstream/issues/134)), the AX-readiness fallback so a slow Chromium tree no longer fails a dictation ([#181](https://github.com/Nabzx/openstream/issues/181)), and the IDE-terminal delivery gaps ([#227](https://github.com/Nabzx/openstream/issues/227)).
- [x] **Short landing page** ([#21](https://github.com/Nabzx/openstream/issues/21)) — `site/index.html`. The demo GIF is still outstanding.
- [ ] **Pre-launch manual verification pass** ([#228](https://github.com/Nabzx/openstream/issues/228)) — the checks CI cannot drive, against the near-final build: the voice-edit matrix, IDE-terminal dictation, end-to-end dictation + latency, the shortcut matrix, the break-safe apps setting. This is what stands between here and the tag.
- [ ] **Demo GIF** — a short screen recording of a real dictation, into the README and the landing page.
- [ ] **Real-dictation eval corpus** ([#171](https://github.com/Nabzx/openstream/issues/171)) — human-recorded clips for the rules-cleanup fixture. Clears the one deliberately-red test; can slip to a point release.
- [ ] **Public launch** ([#22](https://github.com/Nabzx/openstream/issues/22)) — Show HN, r/macapps, etc.

**Deferred out of v1.0:**

- **Code signing, notarisation, Homebrew cask, auto-update** ([#11](https://github.com/Nabzx/openstream/issues/11)) — v1.0 distributes from source ([#37](https://github.com/Nabzx/openstream/issues/37)), so committing to a signing identity and a cask buys nothing yet. First v1.1 item.
- **Semantic voice edits** ([#222](https://github.com/Nabzx/openstream/issues/222)) — the deterministic command subset ships; "make this shorter" waits on a capable local rewrite model.

**Definition of done:** something you'd hand to a stranger without caveats. Tag `v1.0.0` once [#228](https://github.com/Nabzx/openstream/issues/228) passes.

See [docs/progress/phase-4-progress.md](docs/progress/phase-4-progress.md) for the full checkpoint.

---

## After v1.0

Open to outside contributors. Backlog candidates: Linux/Windows ports, per-project config files, custom wake-word-free modes, team-shared vocabulary packs. Not scoped yet — revisit after launch feedback.

### v1.1 candidates

- **Code signing + notarisation + Homebrew cask + `electron-updater`** ([#11](https://github.com/Nabzx/openstream/issues/11)) — the first thing that makes the DMG a real install path and fixes the rebuild-resets-grants problem ([#46](https://github.com/Nabzx/openstream/issues/46), [#88](https://github.com/Nabzx/openstream/issues/88)) for people who don't build from source.
- **Parakeet TDT 0.6B v3 as the transcription model server** ([#176](https://github.com/Nabzx/openstream/issues/176), [#204](https://github.com/Nabzx/openstream/issues/204), [#205](https://github.com/Nabzx/openstream/issues/205)) — replace `whisper base.en`. The pipeline shape does not change ([ADR-0002](docs/adr/0002-no-one-model-dictation-engine.md)): Parakeet emits raw text, Rules cleanup still does all cleanup. The gate is proving a local runtime on Apple Silicon (NeMo-Speech.cpp / sherpa-onnx / parakeet-mlx are candidates; none built yet) and measuring latency, memory, and artifact size against the contract. [#178](https://github.com/Nabzx/openstream/issues/178) already rejected Parakeet as a *one-model* engine.
- **Semantic voice edits** ([#222](https://github.com/Nabzx/openstream/issues/222)) — re-test a spoken rewrite command ("shorter", "fix grammar") against Qwen3-1.7B / Granite-3.3-2B in the rewrite role.

### Backlog

- **Codebase vocabulary scanner** ([#16](https://github.com/Nabzx/openstream/issues/16)) — moved here from Phase 3. Built, not shipped: the scanning/caching/pipeline wiring exists and is tested (PR #185), the Settings UI is unhooked. Before re-enabling: confirm a live dictation with a configured project path actually gets the biased prompt end to end (a `vocabulary.promptLength` diagnostic exists for exactly this check and hasn't been read back yet).
- **Recording history / replay last transcription** ([#136](https://github.com/Nabzx/openstream/issues/136)), **microphone device selector** ([#137](https://github.com/Nabzx/openstream/issues/137)), **crash reporting** ([#138](https://github.com/Nabzx/openstream/issues/138)).
