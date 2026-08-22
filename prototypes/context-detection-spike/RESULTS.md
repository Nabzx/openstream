# Results map (issue #28)

Status: **partial**. Layer 1 measured. Layer 2 blocked pending an Accessibility
grant, see "What is still missing" at the bottom. Every cell below is a real
observation from `logs/`; nothing here is inferred. Cells that were not measured
say so.

Machine: macOS 15 (Darwin 24.6.0), Apple Silicon, Swift 6.1.2.
Run: `logs/sweep-untrusted.log`, 2026-08-22.

## Layer 1: frontmost app detection

`NSWorkspace.shared.frontmostApplication`, no permission required. Ten apps
activated in turn by `sweep.sh`, probe polling at 400ms.

| App | Kind | Detected | Bundle id reported | Correct |
| --- | --- | --- | --- | --- |
| Terminal | native terminal | yes | `com.apple.Terminal` | yes |
| TextEdit | native (easy case) | yes | `com.apple.TextEdit` | yes |
| Notes | native (easy case) | yes | `com.apple.Notes` | yes |
| Safari | browser (WebKit) | yes | `com.apple.Safari` | yes |
| Google Chrome | browser (Blink) | yes | `com.google.Chrome` | yes |
| Visual Studio Code | Electron editor | yes | `com.microsoft.VSCode` | yes |
| Cursor | Electron editor | yes | `com.todesktop.230313mzl4w4u92` | yes, but see note |
| Obsidian | Electron | yes | `md.obsidian` | yes |
| WhatsApp | Electron chat | yes | `net.whatsapp.WhatsApp` | yes |
| Finder | native | yes | `com.apple.finder` | yes |

**Layer 1 verdict: 10 of 10, no failures, no permission needed.** Electron makes
no difference here. Whatever else is uncertain, "which app is in front" is not.

Two findings that matter for the real helper:

1. **The naive implementation silently lies.** A command-line process that polls
   `frontmostApplication` on a `Thread.sleep` loop keeps reporting whichever app
   was frontmost when it launched, forever. That value is refreshed by
   notifications delivered on the run loop. The first run of this spike produced
   exactly one record, VS Code, for a ten-app sweep. Fixed by pumping
   `RunLoop.current.run(mode:before:)` instead of sleeping. A native helper that
   gets this wrong fails in the worst way: confidently wrong context, no error.
2. **Bundle ids are not always human-readable.** Cursor ships as
   `com.todesktop.230313mzl4w4u92` (ToDesktop packaging). Any app-to-mode
   mapping keyed on bundle id needs a lookup table with opaque ids in it, and
   cannot fall back on pattern-matching the id string.

## Layer 2: focused-element detection

`AXUIElementCopyAttributeValue(..., kAXFocusedUIElementAttribute)`.

Measured so far, from an **untrusted** process:

| App | Focused role | AXValue readable | Error | Notes |
| --- | --- | --- | --- | --- |
| Visual Studio Code | not reported | no | `kAXErrorAPIDisabled` | process not trusted |
| all others | not measured | not measured | not measured | blocked by the same grant |

System-wide focus (`AXUIElementCreateSystemWide`) returned
`kAXErrorCannotComplete` rather than `kAXErrorAPIDisabled` under the same
conditions, so the two entry points do not even report the untrusted state
identically. Worth remembering when writing the helper's error handling.

**This tells us nothing about any app yet.** `kAXErrorAPIDisabled` is the
permission wall, not an app failure. Reporting these rows as app failures would
be worse than reporting nothing, because the formatting modes would be built on
a false map.

## Coverage limits on this machine

The issue asks for a specific spread. What exists here:

| Target from the issue | Available | Substitute used |
| --- | --- | --- |
| native terminal | yes | Terminal.app |
| Electron terminal | **no** | none installed (no Hyper, iTerm, Warp, Ghostty). VS Code's integrated terminal is the closest available proxy and needs a human to focus it |
| VS Code | yes | VS Code, plus Cursor and Windsurf as second and third Electron editors |
| JetBrains IDE | **no** | none installed. Not testable here |
| browser text field | yes | Safari and Chrome, needs a human to click into a field |
| Slack | **no** | not installed. WhatsApp and Microsoft Teams are the available Electron chat proxies |
| native macOS app | yes | TextEdit, Notes, Finder |

JetBrains and a standalone Electron terminal are genuinely untested here and
should not be guessed at. JetBrains in particular is known to gate its Swing
editor surface behind an in-app accessibility setting, which is a different
product answer ("works only if the user turns a knob on") from either working
or failing, and needs its own row once someone has an IDE installed.

## What is still missing

One human action unblocks everything below: grant Accessibility to the process
that launches the probe (run `./run.sh --prompt` from Terminal.app, approve,
then re-run). After that:

1. Re-run the sweep trusted, and record role, subrole, value readability and
   error code per app.
2. Click into a real text field in each app (browser input, VS Code editor, VS
   Code integrated terminal, chat composer) and record what focus reports.
3. Re-run with `--poke` and diff against the trusted run, to see whether
   `AXManualAccessibility` changes what the Electron apps expose. Record per app
   whether the knob was needed, because "works only if we poke it" is a distinct
   answer.
4. Install a JetBrains IDE and a standalone Electron terminal, or mark them
   permanently untested and carry the risk explicitly.

## Answer to the issue

Not yet answerable in full. What is settled:

- The **app-level** half of context awareness is reliable, free, and needs no
  permission. Per-app mode selection ("terminal mode in Terminal, prose mode in
  Slack") is safe to build on.
- The **field-level** half is entirely unmeasured and is where the risk sits.
  The product thesis rests on this half, so the issue stays open until the
  trusted runs above are done.
