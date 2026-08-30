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

> **Update (late Phase 4).** Three decisions changed the shape below:
> - **Transcription moved to Parakeet TDT 0.6b v3** (CoreML / Neural Engine, via FluidAudio - [#317](https://github.com/Nabzx/openstream/pull/317), [ADR-0003](docs/adr/0003-parakeet-for-transcription.md)), replacing `whisper base.en`. The "After v1.0" Parakeet line is now history. macOS floor rose to 14.
> - **v1.0 ships as a source repo, not a distributed app.** Devs clone and build. No DMG focus, no Gatekeeper story. Code signing / notarisation / Homebrew ([#11](https://github.com/Nabzx/openstream/issues/11)) moved to **v2.0** - it only matters once OpenStream is something you download rather than build.
> - **The eval corpus ([#171](https://github.com/Nabzx/openstream/issues/171)) and the semantic-voice-edit spike ([#222](https://github.com/Nabzx/openstream/issues/222)) moved to v1.1.** Neither blocks a beta.
>
> What's left for the tag: [#228](https://github.com/Nabzx/openstream/issues/228) verification pass, the demo recording ([#21](https://github.com/Nabzx/openstream/issues/21)), the stray-punctuation fix ([#320](https://github.com/Nabzx/openstream/issues/320)), then [#22](https://github.com/Nabzx/openstream/issues/22).

- [x] **Permission state check** — the app probes all three grants at launch (functionally, since a System Settings toggle can read ON while the binary is denied) and blocks on Accessibility / Input Monitoring, opening on a Permissions screen; `npm run doctor` runs the same check from the terminal ([#47](https://github.com/Nabzx/openstream/issues/47)). The rebuild/TCC-identity problem ([#46](https://github.com/Nabzx/openstream/issues/46), [#88](https://github.com/Nabzx/openstream/issues/88)) is documented, not solved — it is a source-only fact of life.
- [x] **Settings UI complete** — hotkey remapping (Zazai's [#218](https://github.com/Nabzx/openstream/issues/218)), the user-editable break-safe app list with a native app picker ([#19](https://github.com/Nabzx/openstream/issues/19)), and launch-at-login ([#135](https://github.com/Nabzx/openstream/issues/135)). No mode rules ([#45](https://github.com/Nabzx/openstream/issues/45)), no model choice ([#30](https://github.com/Nabzx/openstream/issues/30)).
- [x] **Release automation** — a `v*` tag builds an unsigned arm64 DMG and cuts a GitHub release; hyphenated tags publish as pre-releases ([#20](https://github.com/Nabzx/openstream/issues/20), proven end to end with a `v0.4.0-rc.1` dry run). No Homebrew bump yet — that waits on signing.
- [x] **Window redesign** — the desktop window got a real visual pass: refreshed tokens, an app mark, a calmer Home page, a proper Permissions gate screen, live dictation activity ([#242](https://github.com/Nabzx/openstream/issues/242), and the app/menu-bar icons in [#244](https://github.com/Nabzx/openstream/issues/244)).
- [x] **Track-A pipeline fixes** — Escape-to-cancel ([#134](https://github.com/Nabzx/openstream/issues/134)), the AX-readiness fallback so a slow Chromium tree no longer fails a dictation ([#181](https://github.com/Nabzx/openstream/issues/181)), and the IDE-terminal delivery gaps ([#227](https://github.com/Nabzx/openstream/issues/227)).
- [x] **Short landing page** ([#21](https://github.com/Nabzx/openstream/issues/21)) — `site/index.html`. The demo GIF is still outstanding.
- [x] **Model weights leave the bundle** ([#249](https://github.com/Nabzx/openstream/issues/249)) — the rewrite model downloads on first run; Parakeet's CoreML bundles (~470 MB) download on the transcription helper's first run via FluidAudio. A `git clone` install stages the rewrite model in `postinstall`. Full first-run download UX for a packaged app is a v1.1 concern now that v1.0 is source-only.
- [ ] **Pre-launch manual verification pass** ([#228](https://github.com/Nabzx/openstream/issues/228)) — the checks CI cannot drive, against the near-final build: the voice-edit matrix, IDE-terminal dictation, end-to-end dictation + latency, the shortcut matrix, the break-safe apps setting, plus Parakeet's first-run download and accuracy. This is what stands between here and the tag.
- [ ] **Demo GIF** — a short screen recording of a real dictation, into the README and the landing page.
- [ ] **Public launch** ([#22](https://github.com/Nabzx/openstream/issues/22)) — Show HN, r/macapps, etc.

**Deferred:**

- **Code signing, notarisation, Homebrew cask, auto-update** ([#11](https://github.com/Nabzx/openstream/issues/11)) → **v2.0**. v1.0 is a source repo; a signing identity and a cask only matter once OpenStream is downloaded rather than built.
- **Real-dictation eval corpus** ([#171](https://github.com/Nabzx/openstream/issues/171)) → **v1.1**. Clears the one deliberately-red test; not a beta blocker. Its capture recipe needs updating for the Parakeet helper first.
- **Semantic voice edits** ([#222](https://github.com/Nabzx/openstream/issues/222)) → **v1.1**. The deterministic command subset ships; "make this shorter" waits on a capable local rewrite model.

**Definition of done:** something you'd hand to a stranger without caveats. Tag `v1.0.0` once [#228](https://github.com/Nabzx/openstream/issues/228) passes.

See [docs/progress/phase-4-progress.md](docs/progress/phase-4-progress.md) for the full checkpoint.

---

## After v1.0

The read on the competition is in [docs/competitive/opensuperwhisper.md](docs/competitive/opensuperwhisper.md): OpenSuperWhisper leads on distribution and model options; OpenStream leads on everything that happens *after* the transcript. The plan below closes the parity gap while pressing that advantage. Milestones `v1.1` and `v1.2` on the tracker hold these issues.

### Shipped since v1.0 planning

- **Parakeet TDT 0.6b v3 as the transcription model server** — replaced `whisper base.en` ([#317](https://github.com/Nabzx/openstream/pull/317), [ADR-0003](docs/adr/0003-parakeet-for-transcription.md)). Runs as CoreML on the Neural Engine via FluidAudio. Pipeline shape unchanged ([ADR-0002](docs/adr/0002-no-one-model-dictation-engine.md)). Remaining accuracy follow-ups: [#320](https://github.com/Nabzx/openstream/issues/320) (done), [#321](https://github.com/Nabzx/openstream/issues/321), [#322](https://github.com/Nabzx/openstream/issues/322).

### v1.1 — parity + the quick wins their users are begging for

- **Codebase vocabulary biasing** ([#250](https://github.com/Nabzx/openstream/issues/250)) — un-shelve [#16](https://github.com/Nabzx/openstream/issues/16). Note: Parakeet has no `initial_prompt`; the boosting route is [#322](https://github.com/Nabzx/openstream/issues/322) (FluidAudio keyword spotter) plus [#321](https://github.com/Nabzx/openstream/issues/321) (a post-hoc correction table).
- **Remove the dormant whisper.cpp path** ([#326](https://github.com/Nabzx/openstream/issues/326)) — kept as a revert path while Parakeet proved out; delete once [#228](https://github.com/Nabzx/openstream/issues/228) confirms it.
- **Eval corpus** ([#171](https://github.com/Nabzx/openstream/issues/171)), **semantic voice edits spike** ([#222](https://github.com/Nabzx/openstream/issues/222)).
- **In-app model picker + download** ([#251](https://github.com/Nabzx/openstream/issues/251)), **multiple languages + auto-detect** ([#252](https://github.com/Nabzx/openstream/issues/252)), **drag-and-drop file transcription** ([#253](https://github.com/Nabzx/openstream/issues/253)).
- **Polish parity** — surface model-server failures to the user ([#254](https://github.com/Nabzx/openstream/issues/254)), copy-to-clipboard option ([#255](https://github.com/Nabzx/openstream/issues/255)), completion chime + indicator position ([#256](https://github.com/Nabzx/openstream/issues/256)), idle model unload ([#257](https://github.com/Nabzx/openstream/issues/257)), mouse-button trigger ([#258](https://github.com/Nabzx/openstream/issues/258)), and the deferred [#136](https://github.com/Nabzx/openstream/issues/136) / [#137](https://github.com/Nabzx/openstream/issues/137).

### v1.2 — the overtake features (neither app has them)

- **Post-processing hooks after cleanup** ([#259](https://github.com/Nabzx/openstream/issues/259)) — their [#55]. Also the home for semantic voice edits ([#222](https://github.com/Nabzx/openstream/issues/222)).
- **Per-app / profile behaviour** ([#260](https://github.com/Nabzx/openstream/issues/260)) — their [#203]. We already detect the frontmost app for break-safety; extend it.
- **Coding-agent dictation mode** ([#261](https://github.com/Nabzx/openstream/issues/261)) — their [#188]. Our lane.
- **Live partial-text display during recording** ([#262](https://github.com/Nabzx/openstream/issues/262)).

### v2.0 — a real install path

- **Signing + notarisation + Homebrew + auto-update** ([#11](https://github.com/Nabzx/openstream/issues/11)) — the point where OpenStream stops being "clone and build" and becomes something you download. Needs an Apple Developer identity. Not before there is demand for it.

### Backlog

- **CLI** ([#263](https://github.com/Nabzx/openstream/issues/263)), **recording retention controls** ([#264](https://github.com/Nabzx/openstream/issues/264)), **auto-pause media during recording** ([#265](https://github.com/Nabzx/openstream/issues/265)), **crash reporting** ([#138](https://github.com/Nabzx/openstream/issues/138)).
- Not scoped: Linux/Windows ports, Intel macOS, an iOS companion, speaker diarization, a CLI daemon.
