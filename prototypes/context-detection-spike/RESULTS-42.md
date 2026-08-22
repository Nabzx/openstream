# Results map, second pass (issue #42)

Status: **instrumentation ready and the two preconditions that could have
blocked the whole ticket are cleared. The measurement itself has not been run.**

Nothing in this file is inferred. Cells that were not measured say so; they are
not filled in with expectations. The three tables below are the shape the answer
will take, with the app list and the verdict vocabulary settled.

Machine: macOS 15.6.1 (Darwin 24.6.0), Apple Silicon, Swift 6.1.2. 2026-08-22.

## What this pass established before running anything

Both of these were open risks that could have made the ticket impossible, and
both are now closed:

1. **Accessibility trust survives.** Terminal.app was granted during issue #28
   and **still holds the grant**: a probe launched from Terminal.app reports
   `AXIsProcessTrusted() = true` and returns a fully populated focused element
   (VS Code, `AXTextField`, role description "text field", `AXValue` readable).
   No new grant, and no trip through System Settings, is needed.

   The distinction from #28 still bites and is worth restating: **the process
   that needs the grant is whatever launches the probe**, not the probe. A probe
   launched from an agent shell in this same session reports
   `AXIsProcessTrusted() = false` and every focused-element read comes back
   `kAXErrorAPIDisabled`. Same binary, same machine, same minute. Run the pass
   from Terminal.app.

2. **The three missing apps are installed.** `brew install --cask slack hyper
   intellij-idea-ce` - Slack 4.51.191, Hyper 3.4.1, IntelliJ IDEA CE 2025.2.5,
   all arm64. All three launch and run.

   **Hyper is the right Electron terminal for this test, and the other two
   candidates in the issue are not.** The issue names "Hyper, Warp, Ghostty" as
   interchangeable, and for this question they are not: Warp is Rust and Ghostty
   is Zig with a native macOS UI, so neither would test the Electron shape at
   all. Only Hyper is genuinely Electron. If Warp or Ghostty get tested later
   they answer a different question - "do native-but-not-Terminal.app terminals
   repeat the scrollback shape" - and need their own rows.

## Why the measurement did not run

The pass drives focus between apps with AppleScript, which means every step goes
through `osascript` and `System Events`, and it has to be launched inside
Terminal.app to inherit the Accessibility grant. **The agent session running
this work is not permitted to invoke `osascript`**, so it cannot start the pass.
This is a harness permission boundary, not a technical obstacle: the scripts are
written, executable, and take one command.

## How to run it

One command, from anywhere:

```sh
osascript -e 'tell app "Terminal" to do script "'"$PWD"'/run-all-42.sh"'
```

Or open Terminal.app and run `./run-all-42.sh` directly. It takes roughly 8-10
minutes, steals focus continuously for that whole time, and should be run on a
machine nobody is using - that is a precondition of the ticket, not a nicety,
because a person using Chrome mid-pass is exactly what made three cells
inconclusive in #28.

`run-all-42.sh` covers the sweep, the field pass, the focus retry and the
controlled A/B. `jetbrains-knob-ab.sh` is deliberately left out of it: IntelliJ
needs one manual first launch - past the licence agreement and the first-run
wizard, left with a project and a file open in the editor - before its arms mean
anything. The privacy-policy and consent files have been pre-accepted on this
machine, so that first launch should be short.

## Layer 1: frontmost app detection - NOT YET MEASURED

`NSWorkspace.shared.frontmostApplication`, no permission required.
Filled by `sweep-42.sh`.

| App | Kind | Detected | Bundle id reported | Correct |
| --- | --- | --- | --- | --- |
| Slack | Electron chat | not measured | | |
| Hyper | Electron terminal | not measured | | |
| IntelliJ IDEA CE | Swing IDE (JVM) | not measured | | |
| Safari | browser (WebKit) | #28: yes | `com.apple.Safari` | yes |
| Notes | native | #28: yes | `com.apple.Notes` | yes |
| WhatsApp | native (Catalyst) | #28: yes | `net.whatsapp.WhatsApp` | yes |

Layer 1 was already correct for all ten apps in #28 and no failure is expected
here. The row that carries real information is the **bundle id** column: #28
found that Cursor ships as `com.todesktop.230313mzl4w4u92`, so an app-to-mode
mapping cannot pattern-match id strings and needs a lookup table containing
opaque ids. Slack, Hyper and IntelliJ's ids go in that table.

## Layer 2: focused-element detection - NOT YET MEASURED

Filled by `field-pass-42.sh` and `focus-retry-42.sh`.

| App / field | Focused role | AXValue | AXSelectedText | Knob | Verdict |
| --- | --- | --- | --- | --- | --- |
| Slack, message composer | not measured | | | | |
| Hyper, shell prompt | not measured | | | | |
| IntelliJ, editor (knob off) | not measured | | | | |
| IntelliJ, editor (knob on) | not measured | | | | |
| Safari, address bar | not measured (#28 inconclusive) | | | | |
| Notes, search field | not measured (#28 inconclusive) | | | | |
| WhatsApp, search / composer | not measured (#28 inconclusive) | | | | |

The specific question behind each row, so the log can be read for a verdict
rather than for atmosphere:

- **Slack.** #28 established that `AXManualAccessibility` is what makes Electron
  apps publish a tree, and that the two Electron apps tested (Cursor, Obsidian)
  then exposed only a **container** role - `AXWebArea` and `AXGroup` - not a
  text role. The helper learns "some web surface" and not what kind of field.
  The question for Slack is whether its composer is a third instance of that
  container problem or a genuine text role. Slack is where a wrong mode is most
  visible to a user, since dictating into a chat composer is a daily path, so a
  container-only reading here is a product problem, not a curiosity.
- **Hyper.** #28 found native Terminal.app returns **the entire scrollback** in
  `AXValue` - 5673, then 10310, then 15646 characters as output accumulated -
  not the input line. Anything in the roadmap that assumes the helper can read
  the current command line is already in trouble. The question is whether an
  Electron terminal repeats that shape, which would make the caveat general, or
  fails differently, which would make it Terminal.app-specific.
- **IntelliJ.** See the third-category table below.
- **Safari, Notes, WhatsApp.** These are re-runs, not new tests, and #28 was
  explicit that their `kAXErrorNoValue` cells are a **test artifact**: a person
  was using Chrome on the same machine and reclaimed focus within a second each
  time, and the window title came back `kAXErrorNoValue` in those samples,
  meaning the app had no focused window at that instant. `focus-retry-42.sh`
  removes that artifact by re-asserting activation every two seconds across the
  dwell instead of sleeping through it, and prints the re-assertion count so the
  dwell is auditable.

## The third category - NOT YET MEASURED

Filled by `jetbrains-knob-ab.sh`. This is the row the issue is really about.

| Arm | `SUPPORT_SCREEN_READERS` | Focused role | AXValue | Verdict |
| --- | --- | --- | --- | --- |
| A | `false` | not measured | | |
| B | `true` | not measured | | |

**Why this is a third answer and not a variant of the other two.** JetBrains
renders its editor in Swing, not Chromium. Swing publishes an accessibility tree
only when the IDE's own "Support screen readers" option is on. macOS
Accessibility trust does not reach it, and neither does `AXManualAccessibility` -
that attribute is a Chromium mechanism and the JVM is not Chromium, so the poke
that fixes every Electron app does nothing here. If arm A fails and arm B works,
then there exists a class of app where **the helper cannot fix detection from
outside and the user has to turn something on**, and the mode mapping needs:

- a third state per app, alongside works and fails;
- a way to detect that state at runtime rather than guessing it;
- user-facing copy that names the setting, since the only available fix is to
  ask.

If both arms fail, JetBrains is simply a known-bad app and the mapping stays
two-valued. If both arms work, the knob is irrelevant on macOS and the concern
dissolves. All three outcomes are useful; only the first costs design work.

The knob is driven from disk rather than through the IDE's settings UI:

```
~/Library/Application Support/JetBrains/IdeaIC*/options/ide.general.xml
  <option name="SUPPORT_SCREEN_READERS" value="true|false" />
```

It is read at startup only, so each arm gets a full quit and a cold relaunch.

## The controlled A/B re-run - NOT YET MEASURED

Filled by `controlled-ab-42.sh`. This settles a #28 result that is currently
stated as "`AXManualAccessibility` **appears** required".

| App (fresh pid) | Arm A, no poke | Arm B, poke |
| --- | --- | --- |
| Cursor | not measured | |
| Obsidian | not measured | |

#28's A/B was already good evidence - two apps, fresh processes, no competing
accessibility client, and a focused element appearing **only** in the poked arm
for both - and it is held back by exactly one defect: the arms did not get equal
exposure. VS Code hosts the session driving the probe and kept reclaiming focus,
so Cursor and Obsidian each held focus for roughly one second in arm A against
13-25 seconds in arm B. **A one-second window may simply be too short for a
focused element to exist yet**, and that rival explanation is what keeps the
claim at "appears".

The fix is not a longer sleep, because focus is lost during a sleep just the
same. `controlled-ab-42.sh` re-asserts activation every two seconds across a
24-second dwell, so nothing can hold focus for more than two seconds, and both
arms get the same audited exposure. It also checks that Wispr Flow actually
quit and warns if it did not, since Chromium builds its tree when **any** AT
client asks and a surviving Wispr Flow would confound arm A the way it did the
first time.

Note that the practical recommendation does not change whichever way this lands:
poking is free, and it is a no-op on native apps
(`kAXErrorAttributeUnsupported`). What changes is whether the map can state it
as a fact.

## Answer to the issue

**Not yet answerable.** The two things that could have made it unanswerable are
cleared - the Accessibility grant survives, and all three apps are installed and
running - and the instrumentation is written and takes one command. What is
missing is one unattended run on a machine nobody is using.

The known-bad set therefore still stands where #28 left it: **Cursor** and
**Obsidian** expose container roles only, and Slack, JetBrains and Electron
terminals remain unmeasured rather than known-good.

Per the issue, sharpening the **field-level** half of the per-mode formatting
rules (#13) waits on this. The **app-level** half does not and can start now:
layer 1 was correct for all ten apps in #28, needs no permission, and the only
new input this pass will add to it is three more bundle ids for the lookup
table.
