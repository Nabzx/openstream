# OpenStream — Engineering Deep Dive (Phase 4 checkpoint)

Same purpose as the others: so either of us can explain this project in depth, from memory, in an interview. Not marketing copy — where something is fragile or deferred, it says so.

This is the fourth checkpoint in `docs/progress/` — written with Phase 4 **feature-complete for `v1.0`** and the final on-device verification pass ([#228](https://github.com/Nabzx/openstream/issues/228)) still outstanding. [phase-3-progress.md](phase-3-progress.md) is the previous one. Where a section hasn't materially changed it says so.

*Updated late Phase 4 (August 2026): the first-run model download ([#249](https://github.com/Nabzx/openstream/issues/249)), the Commands reference tab ([#247](https://github.com/Nabzx/openstream/issues/247)), and the full terminal/phosphor rebrand ([#276](https://github.com/Nabzx/openstream/issues/276), sub-issues [#278](https://github.com/Nabzx/openstream/issues/278)–[#282](https://github.com/Nabzx/openstream/issues/282)) all landed after the first draft. Sections below fold them in.*

**Contents**
1. [What OpenStream is](#1-what-openstream-is)
2. [Tech stack, and what changed](#2-tech-stack-and-what-changed)
3. [Process architecture](#3-process-architecture)
4. [Walking one dictation, end to end](#4-walking-one-dictation-end-to-end)
5. [New architectural decisions and findings this phase](#5-new-architectural-decisions-and-findings-this-phase)
6. [Testing philosophy](#6-testing-philosophy)
7. [How we work: process and rigor](#7-how-we-work-process-and-rigor)
8. [Vocabulary](#8-vocabulary)
9. [War stories worth telling in an interview](#9-war-stories-worth-telling-in-an-interview)
10. [Where we actually are vs. the roadmap](#10-where-we-actually-are-vs-the-roadmap)
11. [What's unfinished, fragile, or deliberately deferred](#11-whats-unfinished-fragile-or-deliberately-deferred)
12. [File map](#12-file-map)

---

## 1. What OpenStream is

Unchanged — a **local-first voice dictation app for Apple Silicon Macs**, aimed at developers, **deny-by-default on line breaks**. See [phase-1-progress.md §1](phase-1-progress.md#1-what-openstream-is).

What's different: nothing about the *product* changed this phase. Phase 4 is polish — the app is now something you could hand to a stranger. Both headline features (dictation, voice editing) shipped in earlier phases; Phase 4 added the launch surface around them: a permission gate, a finished settings screen, a Commands reference tab, a first-run model download so the DMG isn't ~1.3 GB, a full terminal/phosphor rebrand across the app, overlay, icons and launch surfaces, release automation, and the pipeline-robustness fixes that turn "works on my machine" into "works from a VS Code terminal too".

## 2. Tech stack, and what changed

Full table in [phase-1-progress.md §2](phase-1-progress.md#2-tech-stack-and-why-each-piece). This phase:

- **`engines` bumped to Node ≥ 22.12** (was 20). CI runs 22.12.
- **The renderer grew to five pages and real chrome.** `src/pages/Permissions.tsx` (the gate screen #47 opens on), `src/pages/Commands.tsx` (the spoken-command reference, driven by `src/commandReference.ts`, with the quick-formatting fixes folded in — #247), `src/pages/Setup.tsx` (the first-run model-download screen — #249), `src/components/Mark.tsx` (the app mark — a caret in a listening ring), a `dictation-state` IPC subscription so Home reflects live activity, a native app picker for the break-safe list (`electron/appBundleId.js` reads `CFBundleIdentifier` via `defaults read`), a `localStorage`-backed disclosure on the System card. `src/nav.ts` now carries `home | commands | settings | permissions | setup` with three tab pages.
- **`src/index.css` was rewritten twice.** First from the Phase-3 token stub to a considered light/dark system (#242); then, for the rebrand (#279), to the **dark-only terminal/phosphor identity** — Space Mono (bundled in `src/fonts/`), two greens on near-black `#020402`, hard 1px borders, no shadows, a faint scanline. Every class name was kept so no page markup changed. `docs/design/visual-identity.md` is the settled direction.
- **Model weights leave the bundle.** `electron/modelStore.js` (`resolveModelPath`, `ensureModels` with streamed sha256 verification, HF-redirect following) plus `src/pages/Setup.tsx` and startup gating in `main.js`: a packaged first run downloads `ggml-base.en` (~141 MB) and the SmolLM2 GGUF (~1 GB) into `userData/models`, showing progress on the Setup screen, and the hotkey stays disarmed until they land (#249). `whisperServer.js` / `rewriteModelServer.js` resolve their model path lazily at `start()`.
- **Two new pure Electron modules.** `electron/permissions.js` — `evaluatePermissions(raw)`, a pure verdict function (`granted` / `missing` / `unknown` per grant, `blocking` vs `warnings`). `electron/appBundleId.js` — the bundle-id reader, execFile injected for tests.
- **A release workflow.** `.github/workflows/release.yml` — a `v*` tag builds an unsigned arm64 DMG and cuts a GitHub release; hyphenated tags publish as pre-releases.
- **Two by-hand asset toolchains.** `scripts/build-icons.sh` rasterises `assets/icon.svg` (now the phosphor tile) into `assets/icon.icns` and the recoloured menu-bar PNGs. `scripts/build-branding.sh` rasterises `assets/branding/*.svg` into the DMG background, the GitHub social card and the README banner. Both need `rsvg-convert`; neither is wired into the build.
- **The overlay is a terminal panel now.** `electron/overlay/` dropped the macOS `vibrancy: "hud"` glass for a solid `--bg` panel with a 1px phosphor border, bundling Space Mono locally because its CSP is `'self'` (#281). The window is `roundedCorners: false` / `hasShadow: false` so the border stays flush (#294/#295).
- **Testing grew to ~257 `node --test` cases (1 skipped) plus 116 Vitest** — new suites for the permission verdict, the bundle-id reader, the injection-path retry, the model store, and the window/Commands paths.

## 3. Process architecture

Unchanged in shape — see [phase-1-progress.md §3](phase-1-progress.md#3-process-architecture--the-eight-things-running-at-once). The accessibility-helper gained:

- a **`permissions` command** (#47) — emits `AXIsProcessTrusted()` and `IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)`, the two grants the pipeline depends on, read from the process macOS actually attributes them to.
- an **enriched `context` error reply** (#227) — a hard failure now carries `trusted` and an accurate reason (`no frontmost application`, not the old misleading `focused element unavailable`).

`RealFocusResolver` now retries a not-yet-ready AX tree within a budget on **both** paths: context detection (`axReadyBudgetMs`, 250 ms — #181) and the injection path (`axInjectBudgetMs`, 200 ms — #227). The injection engine had no retry before; a slow Electron target lost the dictation even when the tree came good a beat later.

## 4. Walking one dictation, end to end

The path is unchanged from [phase-2-progress.md §4](phase-2-progress.md#4-walking-one-dictation-end-to-end). One change before the path even starts, and two robustness changes on it:

- **First run gates on the model download (#249).** `whenReady` checks `modelsMissing()`; if so it opens the window on the Setup screen and runs `ensureModels`, streaming each file to `userData/models` with a running sha256 check and following Hugging Face redirects. The model servers and the push-to-talk hotkey only come up once the weights are verified in place (`maybeStartHotkey()` gates on `captureReady && modelsReady`). A `git clone` install still has the weights staged by `postinstall`, so this path is a no-op there.

Two robustness changes on the dictation path itself:

- **Context detection no longer hard-fails.** If the focused element isn't AX-ready inside the budget, `focusContext` returns `(bundleId, isOneLineField: true, axReady: false)` — an unknown-field context that denies line breaks — and the dictation proceeds, rather than ending as a silent `failed` (#181).
- **A context read that fails outright now holds the transcript.** Helper down, or nothing frontmost → the words are cleaned with safe defaults and returned as a **Held result** for manual paste, not dropped (#227). And `main.js` logs one `[dictation] outcome: …` line per attempt, so one failed dictation on a real Mac names the stage.

## 5. New architectural decisions and findings this phase

### #47: permission identity across rebuilds is a source-only fact of life, not a bug to fix

The Phase-2 open question was whether the Electron host bundle could keep a TCC-stable code identity across rebuilds (#88). It can't, not without a real signing identity — ad-hoc signing has no stable CDHash, so every `npm install` re-keys the grant to a new binary. Rather than chase that, #47 does the two things that work regardless: the app **probes** all three grants functionally at launch (a System Settings toggle can read ON while the binary is denied), **blocks** on Accessibility / Input Monitoring by opening on the Permissions screen, and ships `npm run doctor` for the same check from the terminal. The honest "remove the stale OpenStream entry in System Settings first, then re-add" workflow is documented in the README and on the Permissions screen. The real fix is signing (#11), deferred to v1.1.

### #181 / #227: the injection path got the retry that context detection already had

#173 (Phase 3) fixed the app-switch tracker. #181 then found context detection still hard-failed when the focused element wasn't AX-ready in time — common for a cold Chromium/Electron tree, measured at 5+ seconds in `prototypes/electron-ax-tree-10`. Fix: a bounded retry, then fall back to an unknown-field context. #227 — "dictation produces no visible text when launched from a VS Code terminal" — turned out to be the same class of problem one layer down: the **injection** path did a single-shot focus read with no retry, so a target whose tree wasn't up on the first read fell straight through to blind-paste-or-hold. PR #238 gave it a retry within its own (shorter, latency-sensitive) budget, and a later commit added `[dictation]` diagnostic logging for the focus-resolution failure. What remains on #227 is a real-Mac diagnostic pass to confirm nothing else is wrong — folded into #228.

### ADR-0002: the one-model dictation engine was rejected by its own benchmark

The [#176](https://github.com/Nabzx/openstream/issues/176) map asked whether a single local speech model could be OpenStream's whole ordinary-dictation engine — collapsing transcription and Rules cleanup into one model that emits final text. #178 benchmarked the budget-fitting candidates (Parakeet TDT 0.6B v3, Nemotron 3.5 ASR 0.6B; Canary-1B-v2 was already out on size) and **rejected the approach**: they emit literal ASR — fillers, "scratch that", spoken punctuation all pass through — and Nemotron misses the long-dictation latency target. [ADR-0002](../adr/0002-no-one-model-dictation-engine.md) fixes ordinary dictation as two stages (transcription model server + deterministic Rules cleanup), confirming and extending ADR-0001. Using Parakeet *as the transcription model server alone* — keeping the two-stage shape — is a separate, still-open question deferred to v1.1 (#204, #205).

### Release automation, proven before it was needed

#20's workflow was validated with a `v0.4.0-rc.1` dry-run tag, then deleted. The dry run surfaced two real bugs that a first `v1.0.0` tag would otherwise have hit: `npm version` rejects `X.Y-rc` style tags (must be full semver `X.Y.Z-rc.N`), and `softprops/action-gh-release` published every tag as a full release until a `prerelease:` guard was added for hyphenated tags.

### The window redesign, then the rebrand

Not a research decision, but two of the phase's largest changes. The Phase-3 window was a functional System-Settings clone; the #242 pass gave it identity: the **Mark** (a monoline caret-in-a-ring, reused across the window, the menu bar, and the app icon), a calmer Home that leads with a ready state and collapses its detail rows, a proper **Permissions gate screen**, and **live dictation activity** — Home shows "Listening…" with the Mark pulsing while the key is held. Done as an iterative pass with a preview artifact reviewed between steps.

Then the whole look changed again. The landing-page work (#278) settled a **terminal/phosphor visual identity** — Space Mono, two greens on near-black, a static scanline, hard edges — and #279–#282 carried it through the app window, the push-to-talk overlay, the app and menu-bar icons, and the launch surfaces (DMG background, GitHub social card, README banner). The macOS window structure (traffic lights, hidden-inset title bar) was kept and recoloured; `src/index.css` is now dark-only, every class name preserved so no page markup moved. `docs/design/visual-identity.md` records the settled palette and the per-surface decisions. Two follow-up fixes landed straight after: a main-window close crash from a stale `win.webContents` read (#294) and the overlay border completeness (#295).

### #249: the DMG stops bundling 1.15 GB of model weights

The convenience DMG was ~1.3 GB because it shipped `ggml-base.en` and the SmolLM2 GGUF inside the app. #249 moved both to a **first-run download**: `electron/modelStore.js` verifies and fetches them into `userData/models` on a packaged first launch, `src/pages/Setup.tsx` shows the progress, and the model servers plus the hotkey stay down until the weights are verified. A `git clone` install is unaffected — `postinstall` still stages the weights. The packaged DMG drops to roughly the Electron runtime plus the native binaries (~150 MB). Investigation #268 tracks going further (Tauri, dropping the resident rewrite model); the guardrail there is that transcription accuracy and deterministic cleanup must not regress.

## 6. Testing philosophy

Core discipline unchanged — [phase-1-progress.md §6](phase-1-progress.md#6-testing-philosophy).

- **CI runs the build, not the suite.** `build.yml` does `npm ci && npm run build` (which typechecks and bundles the renderer, and `postinstall` compiles all four native pieces). It does **not** run `npm test`. The test suite is a local gate. This is a known gap — a `npm test` step belongs in CI.
- **#186 cleared the one deterministic Node-22 failure.** `breakPlacementHttpAdapter`'s timeout test leaned on a real `AbortSignal.timeout()` whose unref'd timer trips `node --test`'s completion heuristic on Node 22. Fixed by injecting the timeout signal so the test drives the abort itself.
- **One test is deliberately skipped.** `electron/cleanup/realDictation.test.js` was a hard failure until #171 fills the fixture corpus; it now `skip`s on an empty corpus instead of failing, so the suite is green while the reminder stays visible in the run output.
- **Manual verification is still the gate.** The voice-edit matrix, IDE-terminal dictation, end-to-end dictation + latency, the shortcut matrix, and the break-safe apps setting all need a real Mac and real apps. Batched into #228, run against the near-final build, before the `v1.0.0` tag.

## 7. How we work: process and rigor

Same foundation — [phase-1-progress.md §7](phase-1-progress.md#7-how-we-work-process-and-rigor). This phase:

- **Prove the release path before you need it.** The `v0.4.0-rc.1` dry run is the pattern — a throwaway tag that exercised `npm ci` → version-from-tag → build → DMG → GitHub release end to end, found two bugs, and was deleted. Cheaper than debugging the real `v1.0.0` tag under launch pressure.
- **The Zazai / hotkey carve-out held.** The parallel shortcut rewrite (#215–#219) stayed entirely Zazai's; Phase 4 work — including the settings UI (#19) and the window redesign (#242) — did not touch `HotkeySettings.tsx`, `hotkeyHelper.js`, or `pushToTalkShortcutController.js`. `HotkeySettings.tsx` is now styled to match the rest of the page **through CSS only**; its markup is still exactly as the shortcut work left it.
- **The UI pass was iterative and reviewed.** Six commits, each with a preview artifact, each confirmed before the next. Not a single "here's the redesign" drop.
- **Decisions recorded as ADRs.** ADR-0002 is the second; the pattern (a `>` supersession note, evidence, a `## Consequences` list) is now established.

## 8. Vocabulary

No additions to `CONTEXT.md` this phase — Phase 3's voice-editing terms and the model-role names all still hold. The one term worth re-stating: the **transcription model server** and the **rewrite model server** are named by role, not by the model in them. ADR-0002 makes that concrete — whisper `base.en` fills the transcription role today, Parakeet is a v1.1 candidate for it, and the two-stage shape is fixed regardless of which model occupies the role.

## 9. War stories worth telling in an interview

- **The release dry-run that found two bugs before the real tag.** A throwaway `v0.4.0-rc.1` tag, cut purely to exercise the pipeline, hit both a semver-format bug in the version step and a missing pre-release flag — either of which would have been a bad first impression on the `v1.0.0` release. Good material for "how do you de-risk a release".
- **The fix was to give the injection path what context detection already had.** #227's "no visible text from a VS Code terminal" sounded like a new bug. It was the same not-ready-AX-tree problem #181 had already solved for *context detection* — the *injection* path just never got the retry. The fix was 20 lines and a config value, and the lesson is to look for the pattern you've already seen before assuming a new failure mode.
- **The map's destination was superseded by its own benchmark.** #176 was scoped around choosing a one-model dictation engine. The benchmark it commissioned (#178) concluded no such model qualifies. ADR-0002 records that, and the map now needs re-pointing at a narrower question. "Sometimes the research answers a different question than the one you asked" — and that's a good outcome, not a failure.
- **See also** the Phase 2 and Phase 3 war stories — the three-layer llama-server path bug, the spike that killed its own feature (voice editing), the `Co-authored-by: Claude` trailer that wouldn't stay removed.

## 10. Where we actually are vs. the roadmap

- **Phases 0–3 — done, tagged** (`v0.1` … `v0.3`). Unchanged.
- **Phase 4 (v1.0: polish & launch) — feature-complete, not tagged.**
  - Permission gate + doctor (#47), settings UI complete (#19 + Zazai's #218 + #135), Commands reference tab (#247), first-run model download (#249), release automation (#20), window redesign (#242 + #244), the full terminal rebrand (#278–#282), the Track-A pipeline fixes (#134, #181, #227, #294) — all **done, merged**.
  - Landing page (#21) done; the **demo GIF** is outstanding.
  - **#228** (the manual verification pass — now also covers the DMG layout, the overlay border, and window close/reopen), **#171** (the eval corpus), the two by-hand rebrand chores (upload the social-preview PNG in repo Settings; `npm run dist` to eyeball the DMG), the **beta-status messaging** thread (#288 map: "Beta release" on Home / About / README — #291/#292 still open), and **#22** (the launch itself) are what's left.
  - **A v1.1+ backlog exists.** The OpenSuperWhisper competitive read (`docs/competitive/opensuperwhisper.md`) generated #250–#265; the app-size investigation (`docs/planning/app-size.md`) generated #268–#272. None block v1.0.
  - **Explicitly deferred to v1.1:** code signing / notarisation / Homebrew / auto-update (#11), Parakeet as the transcription model (#176/#204/#205), semantic voice edits (#222).

The honest one-sentence summary: **the app is code-complete for `v1.0`; what stands between here and the tag is one on-device verification pass, a screen recording, two by-hand asset chores, and the beta-label copy pass.**

## 11. What's unfinished, fragile, or deliberately deferred

Carried forward from [phase-3-progress.md §11](phase-3-progress.md#11-whats-unfinished-fragile-or-deliberately-deferred), still true: no code signing (permission identity across rebuilds unresolved as a consequence), cold start slow, the run-on splitter a known-imperfect heuristic, no automated latency regression test, no `.nvmrc`.

New or changed this phase:

- **CI does not run the test suite** — only the build. A `npm test` step belongs in `build.yml`.
- **The DMG's model download is unverified on a real first run.** #249 moved `ggml-base.en` and the SmolLM2 GGUF out of the bundle into a first-launch fetch (`electron/modelStore.js` + the Setup screen). The path is unit-tested against fakes; a genuine packaged first run on a clean machine — download, resume-on-failure, the hotkey arming afterwards — is part of #228.
- **The DMG installer layout is unverified.** `dmg.background` / `dmg.window` / `dmg.contents` were wired for the rebrand (#282) but only a real `npm run dist` shows whether the app icon and the Applications alias line up on the arrow in the background art.
- **Parakeet's runtime is unproven.** #203 called NeMo-Speech.cpp "plausible" for Apple Silicon; nobody has built it, or sherpa-onnx, or parakeet-mlx. The v1.1 transcription-model swap is gated on that spike (#204/#205).
- **#227 needs a real-Mac confirmation.** The code gaps are fixed (PR #238 + the diagnostic logging); whether anything else is wrong (a lost grant, wrong-app resolution) needs the diagnostic pass in #228.
- **`HotkeySettings.tsx` markup is still Zazai's** — recoloured to the terminal theme via CSS only, but a proper restyle into the card system waits on the shortcut work (#198/#214/#219) fully settling. The current shortcut also still interferes with ordinary typing in some configs (repro on #198).
- **`#171`'s fixture corpus is empty** — one `node --test` case skips until it's filled.
- **The menu-bar icons are recoloured** — idle stays a template glyph, recording is `--acc` green, transcribing is `--acc-2`. Worth a look on a real menu bar during #228.
- **`docs/progress/phase-4-progress.md`'s own §12 file map** lists rebrand and #249 additions but the underlying `phase-3` map it extends predates all of this — treat §12 as "what's new since phase 3", not a full inventory.

## 12. File map

Extends [phase-3-progress.md §12](phase-3-progress.md#12-file-map). Additions this phase:

```
electron/
  permissions.js               — pure evaluatePermissions(raw) → verdict (granted/missing/unknown, blocking vs warnings) (#47)
  appBundleId.js               — reads an .app's CFBundleIdentifier via `defaults read`, execFile injected (#19)
  accessibilityHelper.js       — + getPermissions(); context error carries `trusted` (#47, #227)
  modelStore.js                — resolveModelPath + ensureModels: verify/download the weights to userData on first run (#249)
  whisperServer.js             — resolves its model path lazily at start() via resolveModelPath (#249)
  rewriteModelServer.js        — same; SmolLM2 filename lowercased (#249)
  main.js                      — startup gates on modelsMissing(); Setup progress IPC; overlay vibrancy dropped; window-close crash fixed (#249, #281, #294)
  overlay/overlay.css          — terminal panel: solid --bg, 1px phosphor border, scanline; Space Mono @font-face (#281)
  overlay/space-mono-{400,700}.woff2 — bundled font, CSP is 'self' (#281)

native/accessibility-helper/
  Sources/.../Config.swift      — + axInjectBudgetMs (the injection-path AX retry budget) (#227)
  Sources/.../InjectionEngine.swift — decide() retries focus resolution within the budget (#227)
  Sources/.../RealAdapters.swift — focusContext falls back to an unknown-field context on timeout (#181)
  Sources/accessibility-helper/main.swift — + the `permissions` command (#47)

src/
  pages/Permissions.tsx        — the gate screen the app opens on when blocked (#47), redesigned (#242)
  pages/Commands.tsx           — the spoken-command reference tab, with the quick-formatting fixes folded in (#247)
  pages/Setup.tsx              — first-run model-download screen: progress bar, retry (#249)
  commandReference.ts          — the data behind the Commands tab (#247)
  nav.ts                       — home | commands | settings | permissions | setup; three tab pages (#247, #249)
  components/Mark.tsx          — the app mark: a caret in a listening ring (#242)
  index.css                    — rewritten to the dark-only terminal/phosphor theme, Space Mono, class names kept (#279)
  fonts/space-mono-{400,700}.woff2 — bundled font for the main window (#279)

scripts/
  doctor.mjs                   — `npm run doctor`: the launch permission check from the terminal (#47)
  build-icons.sh               — rasterises assets/icon.svg into the .icns and menu-bar PNGs; phosphor recolour (#244, #280)
  build-branding.sh            — rasterises assets/branding/*.svg into the DMG bg, social card, README banner (#282)
  model-artifacts.mjs          — + stageDylibs(): stages whisper dylibs next to the binary with an @loader_path rpath (#249)

assets/
  icon.svg / icon.icns          — the app icon: phosphor caret-in-ring on a near-black tile (#244, #280)
  branding/*.svg                — sources for the launch surfaces (#282)
  dmg-background.png (+@2x)      — the DMG installer window background, wired via package.json dmg.* (#282)
  social-preview.png            — 1280×640 GitHub social card, uploaded by hand in repo Settings (#282)
  readme-banner.png             — the banner at the top of README.md (#282)

package.json                    — extraResources from resources/bin; dmg.background/window/contents; engines Node ≥22.12 (#249, #282)
.github/workflows/release.yml    — v* tag → unsigned DMG + GitHub release; hyphenated tags are pre-releases (#20)

docs/
  adr/0002-no-one-model-dictation-engine.md      — dictation stays two-stage; one-model rejected (#188, #178)
  design/visual-identity.md                      — the settled terminal/phosphor direction + per-surface decisions (#276)
  planning/app-size.md                           — the tiered plan to shrink the app; the guardrail (#268)
  competitive/opensuperwhisper.md                — the OpenSuperWhisper teardown that seeded #250–#265
  testing/ide-terminal-dictation-227.md          — repro + console-reading guide for #227
  testing/break-safe-apps-settings-19.md          — the break-safe apps manual check
  progress/phase-4-progress.md                    — this file

site/
  index.html                   — the launch landing page, terminal theme (#21, #278)
```

---

*Keep this current as the project moves past what it describes. When `v1.0` ships, this checkpoint gets a short "what the verification pass found" addendum rather than a rewrite.*
