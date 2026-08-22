# Results map (issue #28)

Status: **layer 1 complete, layer 2 measured for 8 of 11 app slots**. Every cell
below is a real observation from `logs/`. Nothing is inferred. Cells that were
not validly measured say "inconclusive" and say why.

Machine: macOS 15 (Darwin 24.6.0), Apple Silicon, Swift 6.1.2.
Runs: `logs/sweep-untrusted.log` (before the Accessibility grant),
`logs/probe-20260822-131700.log` (grant lands mid-run, then trusted sweep),
`logs/probe-20260822-131955.log` (`--poke`),
`logs/probe-20260822-132125.log` (focus pass and retry). 2026-08-22.

## Layer 1: frontmost app detection

`NSWorkspace.shared.frontmostApplication`, **no permission required at all**.
Ten apps activated in turn by `sweep.sh`, probe polling at 400ms.

| App | Kind | Detected | Bundle id reported | Correct |
| --- | --- | --- | --- | --- |
| Terminal | native terminal | yes | `com.apple.Terminal` | yes |
| TextEdit | native | yes | `com.apple.TextEdit` | yes |
| Notes | native | yes | `com.apple.Notes` | yes |
| Safari | browser (WebKit) | yes | `com.apple.Safari` | yes |
| Google Chrome | browser (Blink) | yes | `com.google.Chrome` | yes |
| Visual Studio Code | Electron editor | yes | `com.microsoft.VSCode` | yes |
| Cursor | Electron editor | yes | `com.todesktop.230313mzl4w4u92` | yes, see note 2 |
| Obsidian | Electron | yes | `md.obsidian` | yes |
| WhatsApp | native (Catalyst, see note 3) | yes | `net.whatsapp.WhatsApp` | yes |
| Finder | native | yes | `com.apple.finder` | yes |

**Verdict: correct for all 10 apps once focus settled, no permission needed.**
Electron makes no difference to whether the right app is eventually reported.

It is *not* "no failures", and the log says so. The first sweep produced 18
records for 11 activations. Six name an app that was not the current sweep
target, all six Electron apps, each landing one to three seconds after a
different app was activated. Notes was activated at 1:11:48 and Obsidian
appeared at 1:11:49, four slots before Obsidian's own turn.

This data cannot distinguish the two explanations. Either those apps genuinely
took focus back while finishing a window raise, so the API was telling the
truth, or the API reported a transient wrong value mid-switch. **The product
consequence is the same either way**: dictation samples the frontmost app at
the instant a hotkey is pressed, and an arbitrary instant can land inside one of
those windows. A settle rule (require the same app across two or three
consecutive samples before committing to a mode) is worth testing, but is
unmeasured here and is not claimed.

Three findings for the real helper:

1. **The naive implementation silently lies.** A process polling
   `frontmostApplication` on a `Thread.sleep` loop keeps reporting whichever app
   was frontmost when it launched, forever. That value is refreshed by
   notifications delivered on the run loop. The first run of this spike produced
   exactly one record, VS Code, for a ten-app sweep. Fixed by pumping
   `RunLoop.current.run(mode:before:)` instead of sleeping. This is the worst
   failure mode available: confidently wrong context, no error raised.
2. **Bundle ids are not always human-readable.** Cursor ships as
   `com.todesktop.230313mzl4w4u92` (ToDesktop packaging). Any app-to-mode
   mapping keyed on bundle id needs a lookup table containing opaque ids, and
   cannot pattern-match the id string.
3. **You cannot tell Electron from native by guessing.** WhatsApp looks like an
   Electron chat app and is not: it rejects `AXManualAccessibility` with
   `kAXErrorAttributeUnsupported`, the same as Terminal and Finder, whereas
   VS Code, Cursor and Obsidian accept it with `success`. The probe's poke
   result is a reliable Chromium detector; assumptions are not.

## Layer 2: focused-element detection

`AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute)` after
the Accessibility grant. "Knob" is whether `AXManualAccessibility` was needed.

| App / field | Focused role | AXValue | AXSelectedText | Knob | Verdict |
| --- | --- | --- | --- | --- | --- |
| Terminal, shell prompt | `AXTextArea` | yes, 5673 / 10310 / 15646 chars | yes | unsupported, not needed | works, with a caveat below |
| TextEdit, new untitled doc | `AXTextArea` | yes | yes | unsupported, not needed | works |
| Chrome, address bar | `AXTextField` | yes, 36 chars | yes, 36 chars | unsupported, not needed | works |
| Chrome, page content | `AXLink` / `AXButton` / `AXTextField` | yes | varies by role | unsupported, not needed | works |
| VS Code, untitled editor | `AXTextArea` | **yes, verified: typed "hello world", read back 11 chars** | yes | accepted; necessity unproven, see below | works |
| VS Code, chrome/panel field | `AXTextField` | yes | yes | accepted; necessity unproven | works |
| Cursor | `AXWebArea` ("HTML content") | yes, 0 chars | no | **appears required** | works when poked, container role only |
| Obsidian | `AXGroup` | yes, 0 chars | no | **appears required** | works when poked |
| Notes | `AXWindow` / `AXStandardWindow` when no field focused | no (`kAXErrorAttributeUnsupported`) | no | unsupported | field-level inconclusive |
| Safari | `kAXErrorNoValue` | no | no | unsupported | inconclusive |
| WhatsApp | `kAXErrorNoValue` | no | no | unsupported | inconclusive |
| Finder | `AXGroup` | no (`kAXErrorNoValue`) | no | unsupported | works, not a text surface |

Safari, Notes and WhatsApp are marked inconclusive rather than failing for a
concrete reason: during the focus passes a person was actively using Chrome on
the same machine, and each of those three apps held focus for roughly one second
before Chrome reclaimed it. In those samples the window title was also
`kAXErrorNoValue`, meaning the app had no focused window at that instant. That
is a test artifact, not an app verdict. Re-run `focus-retry.sh` on a quiet
machine to settle them.

### The four findings that matter most

1. **`AXManualAccessibility` looks necessary for Electron, on the best evidence
   available here.** See the controlled A/B section below. Set it on every
   Chromium app the helper meets, unconditionally: it is free, it is a no-op on
   native apps (`kAXErrorAttributeUnsupported`), and both Electron apps that
   could be tested cold exposed a focused element only in the poked arm.
   Chromium builds the tree asynchronously, so reading in the same breath as the
   poke shows nothing even when the poke worked.
2. **VS Code is the good Electron case, but "needs no poke" is NOT established.**
   Its editor reports `AXTextArea`, its panel fields `AXTextField`, and value
   and selection are readable. What cannot be claimed is that this happens
   unaided: Wispr Flow, a context-aware dictation app and therefore an active
   accessibility client, was running for the whole first half of this spike, and
   Chromium builds its tree when *any* AT client asks. VS Code also hosts the
   session driving the probe, so it cannot be restarted cold to check. Treat VS
   Code as "works, poke it anyway".
3. **The system-wide element is useless here.** Every single sample, trusted or
   not, returned `kAXErrorCannotComplete` for
   `AXUIElementCreateSystemWide()` + `kAXFocusedUIElementAttribute`, including
   samples where the per-app query returned a fully populated element. The
   helper must go through `AXUIElementCreateApplication(pid)`.
4. **Terminal's `AXValue` is the whole scrollback, not the input line.** It
   returned 5673, then 10310, then 15646 characters as output accumulated. So
   "read the field to see what the user is typing" does not work in a terminal.
   Terminal mode can be selected by app and role, but any feature needing the
   current command text (vocabulary biasing from the prompt, voice editing of
   the current line) needs a different mechanism there.

### The controlled A/B (`controlled-ab.sh`, `logs/ab-nopoke.log`, `logs/ab-poke.log`)

The first poke run could not support a necessity claim, for two reasons. Wispr
Flow was running, so something else may already have enabled every Chromium
tree. And both arms hit the same long-lived Cursor and Obsidian processes, so
the "un-poked" arm was not actually un-poked.

`controlled-ab.sh` fixes both: it quits Wispr Flow (verified: no matching
processes remained), quits and cold-relaunches Cursor and Obsidian (fresh pids
60052 and 60055), then runs a no-poke arm and a poke arm, typing `hello world`
into a field in each app.

| App (fresh pid) | Arm A, no poke | Arm B, poke |
| --- | --- | --- |
| Cursor 60052 | `kAXErrorNoValue` | `AXWebArea`, role description "HTML content", `AXValue` readable |
| Obsidian 60055 | `kAXErrorNoValue` | `AXGroup`, `AXValue` readable |
| VS Code 8648 (not cold) | `AXTextArea`, **read back the typed 11 chars** | `AXTextArea` / `AXRow` / `AXButton` |

Two apps, fresh processes, no competing accessibility client, and a focused
element appeared **only** in the poked arm for both. That is the strongest
evidence this spike produced, and it points at "poke everything Chromium".

**The caveat that keeps this at "appears required" rather than proven**: the
arms did not get equal exposure. VS Code hosts the session driving the probe and
kept reclaiming focus within a second or two, so in arm A Cursor and Obsidian
each held focus for roughly one second, against 13 to 25 seconds in arm B. A
one-second window may simply be too short for a focused element to exist yet.
Settling this needs a machine nobody is working on. The practical
recommendation does not change either way, because poking is free and harmless.

One cell the A/B strengthens rather than weakens: Chrome kept reporting real
elements (`AXTextField`, then `AXComboBox` with 8 readable characters) during
arm A, with Wispr Flow quit and no poke. Chrome rejects `AXManualAccessibility`
with `kAXErrorAttributeUnsupported` and exposes its tree to a trusted client
anyway, so browsers need no special handling.

Also verified here, and worth separating from "the attribute is non-nil":
typing `hello world` into a VS Code editor and reading `AXValue` back returned
exactly 11 characters. Chrome's address bar likewise returned 36 characters
matching its contents. Those two are the only cells where readability was
checked against known content; the other `yes (0 chars)` cells establish that an
`AXValue` attribute exists and is readable, which is a weaker claim.

### Role vocabulary is not uniform

Text surfaces came back as `AXTextArea` (Terminal, TextEdit, VS Code editor),
`AXTextField` (Chrome address bar, VS Code panel), `AXWebArea` (Cursor) and
`AXGroup` (Obsidian after poke). `AXSubrole` was `kAXErrorNoValue` or
`kAXErrorAttributeUnsupported` almost everywhere and carried no useful signal.
A mode mapping cannot key on role alone; it needs role plus bundle id, and a
default for the unrecognised case.

## Coverage limits on this machine

| Target from the issue | Available | What was used |
| --- | --- | --- |
| native terminal | yes | Terminal.app |
| Electron terminal | **no** | none installed (no Hyper, iTerm, Warp, Ghostty). Untested |
| VS Code | yes | VS Code, plus Cursor as a second Electron editor |
| JetBrains IDE | **no** | none installed. Untested |
| browser text field | yes | Chrome address bar and page content. Safari inconclusive |
| Slack | **no** | not installed. WhatsApp was the nearest chat app and turned out to be native, so it is not an Electron-chat substitute at all |
| native macOS app | yes | TextEdit, Notes, Finder |

JetBrains, a standalone Electron terminal, and a genuine Electron chat app
(Slack itself) are the real gaps. JetBrains in particular gates its Swing editor
behind an in-app accessibility setting, which is a third answer distinct from
works and fails, and needs its own row once someone has an IDE installed.

## Answer to the issue

**Yes, context detection is reliable enough to build on, but not reliable enough
to be silent.**

- The **app-level** half is free, permission-free, and correct for every app
  tested. Per-app mode selection is safe.
- The **field-level** half works in native apps, in Chrome, and in VS Code.
  Electron apps need `AXManualAccessibility` set on them, and the helper should
  set it unconditionally on every Chromium app rather than trying to work out
  which ones need it.
- Known-bad / needs-care set so far: **Cursor** (exposes only a container role,
  `AXWebArea`, so the helper learns "some web surface" and not what kind of
  field), **Obsidian** (exposes `AXGroup`, same problem), and everything
  unmeasured, which still includes Slack, JetBrains and Electron terminals.
- The product thesis survives, but the modes need **a visible indicator of the
  detected mode and a manual override**, because the failure shape is not "no
  answer" but "a plausible wrong answer": a stale frontmost app from a missing
  run loop, a transient app caught mid-switch, or a container role that does not
  say what kind of field it is.
- One thesis-level correction: in a terminal, `AXValue` returns the entire
  scrollback. Anything in the roadmap assuming the helper can read the current
  command line needs rethinking.

Remaining work before this is a complete map: install Slack, a JetBrains IDE and
one Electron terminal, and re-run `focus-retry.sh` and `controlled-ab.sh` on a
machine nobody is using, to settle Safari, Notes and WhatsApp and to turn
"`AXManualAccessibility` appears required" into a proven result.

## Housekeeping from these runs

The sweeps left state on the machine: several Terminal windows, an untitled
TextEdit document, a Safari window, and untitled buffers in VS Code and Cursor.
Wispr Flow was quit for the controlled A/B and relaunched afterwards.

No tests were written for any of this. The prototype skill forbids them ("a
prototype that needs tests is no longer a prototype") while the repo's standing
instructions mandate test-first development. The skill was followed here because
this is throwaway probe code that gets deleted once the question is answered.
Anything lifted out of it into the real native helper gets tests first, as
normal.
