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
| VS Code, untitled editor | `AXTextArea` | yes | yes | accepted, not needed | works |
| VS Code, chrome/panel field | `AXTextField` | yes | yes | accepted, not needed | works |
| Cursor | `AXWebArea` | yes, 0 chars | not reported | accepted, still no field role | partial |
| Obsidian | `kAXErrorNoValue` before poke, `AXGroup` with readable value after | yes after poke | no | **required** | works only when poked |
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

1. **`AXManualAccessibility` is real, and it flipped Obsidian.** Obsidian
   reported `kAXErrorNoValue` for everything before the poke, and `AXGroup` with
   a readable `AXValue` one sample after it (`logs/probe-20260822-131955.log`,
   1:20:28 to 1:20:30). VS Code and Cursor accept the flag too. So the helper
   should set it on every Chromium app it meets, unconditionally. Note that
   Chromium builds the tree asynchronously: reading in the same breath as the
   poke shows nothing even when the poke worked.
2. **VS Code needs no poke at all.** The flagship Electron case in the issue is
   the *good* case: `AXTextArea` in the editor, `AXTextField` in panel fields,
   value and selection both readable. The worry that Electron uniformly breaks
   detection is not supported.
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
- The **field-level** half works in native apps, in Chrome, and in VS Code
  without any special handling. It works in Obsidian only after setting
  `AXManualAccessibility`, and degrades to a container role (`AXWebArea`) rather
  than a field role in Cursor.
- Known-bad / needs-care set so far: **Cursor** (container role only),
  **Obsidian** (needs the poke), and everything unmeasured, which still includes
  Slack, JetBrains and Electron terminals.
- The product thesis survives, but the modes need **a visible indicator of the
  detected mode and a manual override**, because the failure shape is not "no
  answer" but "a plausible wrong answer": a stale frontmost app from a missing
  run loop, a transient app caught mid-switch, or a container role that does not
  say what kind of field it is.
- One thesis-level correction: in a terminal, `AXValue` returns the entire
  scrollback. Anything in the roadmap assuming the helper can read the current
  command line needs rethinking.

Remaining work before this is a complete map: install Slack, a JetBrains IDE and
one Electron terminal, and re-run `focus-retry.sh` on a machine nobody is using
to settle Safari, Notes and WhatsApp.
