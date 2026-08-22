# Results map, second pass (issue #42)

Status: **measured.** Every cell below is a real observation from `logs/`.
Nothing is inferred. Where a result is weaker than it looks, the cell says so.

Machine: macOS 15.6.1 (Darwin 24.6.0), Apple Silicon, Swift 6.1.2. 2026-08-22.
Apps: Slack 4.51.191, Hyper 3.4.1, IntelliJ IDEA CE 2025.2.5, all arm64.
Runs: `logs/probe-42-20260822-175757.log` (sweep, field pass, focus retry),
`logs/ab42-nopoke.log` / `logs/ab42-poke.log` (controlled A/B),
`logs/jetbrains-knob-off.log` / `logs/jetbrains-knob-on.log` (JetBrains).

## Preconditions cleared before measuring

1. **The Accessibility grant survives.** Terminal.app was granted during #28 and
   still holds it. The #28 trap still bites and is worth restating: **the process
   that needs the grant is whatever launches the probe.** A probe launched from
   Terminal.app reports `AXIsProcessTrusted() = true`; the same binary launched
   from an agent shell in the same minute reports `false` and returns
   `kAXErrorAPIDisabled` on every read.
2. **Hyper is the right Electron terminal, and the issue's other two names are
   not.** The issue treats "Hyper, Warp, Ghostty" as interchangeable. **Warp is
   Rust and Ghostty is Zig with a native macOS UI**, so neither tests the
   Electron shape at all. Only Hyper is genuinely Electron.

## Layer 1: frontmost app detection

`NSWorkspace.shared.frontmostApplication`, no permission required.

| App | Kind | Detected | Bundle id reported | Correct |
| --- | --- | --- | --- | --- |
| Slack | Electron chat | yes | `com.tinyspeck.slackmacgap` | yes |
| Hyper | Electron terminal | yes | `co.zeit.hyper` | yes |
| IntelliJ IDEA CE | Swing IDE (JVM) | yes | `com.jetbrains.intellij.ce` | yes |
| Safari | browser (WebKit) | yes | `com.apple.Safari` | yes |
| Notes | native | yes | `com.apple.Notes` | yes |
| WhatsApp | native (Catalyst) | yes | `net.whatsapp.WhatsApp` | yes |

**Verdict: correct for all six.** Layer 1 remains free and reliable.

One new gotcha for the lookup table, and it is not the one #28 predicted. #28
found that ids can be *opaque* (Cursor ships as
`com.todesktop.230313mzl4w4u92`). All three new ids are perfectly readable, so
that risk did not recur here. The new problem is the **app name**: WhatsApp
reports as `‎WhatsApp` with a leading **U+200E LEFT-TO-RIGHT MARK**. An
invisible character in the localised app name will silently break any mapping,
log grep or equality check keyed on the display name. **Key the mode mapping on
bundle id, never on app name** - which the opaque-id finding already implied,
and this makes non-negotiable.

## Layer 2: focused-element detection

| App / field | Focused role | Subrole | AXValue | Knob (`AXManualAccessibility`) | Verdict |
| --- | --- | --- | --- | --- | --- |
| Slack, sign-in screen | `AXWebArea` ("HTML content") | none | yes, 0 chars | **accepted (`success`)** | works when poked, container role only |
| Hyper, shell prompt | `AXTextField` ("text field") | none | yes, **0 chars** | **`kAXErrorAttributeUnsupported`** | reads, but the value is useless - see below |
| IntelliJ, editor | `AXTextArea` ("text entry area") | none | **yes, 87 / 99 chars (file contents)** | `kAXErrorAttributeUnsupported` | **works, at default settings** |
| IntelliJ, project chooser | `AXOutline` / `AXButton` | none | outline: non-string | unsupported | works, not a text surface |
| Safari, address bar | `AXTextField` ("text field") | none | yes, 0 chars | unsupported | **works** (was inconclusive in #28) |
| Notes, search field | `AXTextField` ("search text field") | **`AXSearchField`** | yes, 0 chars | unsupported | **works** (was inconclusive in #28) |
| WhatsApp, search field | `AXStaticText` | `AXSearchField` | **no (`kAXErrorNoValue`)** | unsupported | **known-bad** (was inconclusive in #28) |
| WhatsApp, content | `AXGroup` | `iOSContentGroup` | no (unsupported) | unsupported | known-bad |

### The three findings that change the map

1. **The Electron/native split does not predict the poke.** #28 concluded that
   the poke result "is a reliable Chromium detector". **It is not.** Hyper is a
   genuine Electron app and it **rejects** `AXManualAccessibility` with
   `kAXErrorAttributeUnsupported`, exactly as Terminal, Finder and WhatsApp do,
   while still exposing a focused element unaided. Slack accepts it
   (`success`), like VS Code, Cursor and Obsidian. So Electron apps land on
   *both* sides of the poke, and the poke tells you nothing reliable about what
   an app is. The practical rule is unchanged and now better supported: **set it
   on everything, read nothing into the answer.** It is free, and it is a no-op
   where unsupported.

2. **Both terminals fail to give the current input line, in opposite ways.** #28
   found Terminal.app returns the **entire scrollback** in `AXValue` - 5673,
   then 10310, then 15646 characters as output accumulated. Hyper does the
   reverse: it reports a clean `AXTextField` with role description "text field",
   and its `AXValue` is readable and **always 0 characters**, including
   immediately after `hello world` was typed at the prompt. That is consistent
   with an xterm.js-style hidden input used for IME composition rather than the
   terminal buffer. So the caveat generalises, but the *shape* does not: one
   terminal gives too much, the other gives nothing, and **neither gives the
   current command line**. Anything in the roadmap that assumes the helper can
   read what the user is typing in a terminal needs rethinking - and it cannot
   be fixed by picking a different terminal.

   Hyper is still the better cell in one respect: it reports a genuine text
   role, so terminal *mode selection* by role works there, and unlike Terminal
   there is no risk of a feature accidentally ingesting thousands of characters
   of scrollback as if it were user input.

3. **`AXSubrole` is not always dead, and where it is alive it can lie.** #28
   found subrole was `kAXErrorNoValue` or unsupported "almost everywhere and
   carried no useful signal". Notes contradicts that: its search field reports
   `AXTextField` + **`AXSubrole = AXSearchField`**, which is exactly the kind of
   distinction a mode mapping wants (a search box is not a prose field, and
   should not get sentence-cased dictation). But WhatsApp shows the trap: it
   reports the same `AXSearchField` subrole on a role of **`AXStaticText`**,
   with `AXValue` unreadable. Subrole is worth reading as a refinement, never as
   a primary signal, and never without checking the role it sits on.

## The third category: does JetBrains need a user-enabled setting?

**On the best evidence available: no - IntelliJ's editor is readable at default
settings.** This is the question the issue was really about, and the answer is
the one that costs the least design work.

| Arm | Window reached | Focused role | AXValue |
| --- | --- | --- | --- |
| A (`logs/jetbrains-knob-off.log`) | `Scratch.java - .../idea-prototype-scratch` | `AXTextArea` | yes, 87 chars |
| B (`logs/jetbrains-knob-on.log`) | `Scratch.java - .../idea-prototype-scratch` | `AXTextArea` | yes, 99 chars |

Both arms reached the Swing **editor** (not a dialog), both reported
`AXTextArea` with role description "text entry area", and both read back the
file contents. The char counts differ only because each arm typed `hello world`
into the file, so it grew by 11 characters between runs - that is the probe
reading real editor content, which is the point.

**The honest limit on this result, and it matters.** This is *not* a clean
on/off A/B. The script writes `SUPPORT_SCREEN_READERS` into
`~/Library/Application Support/JetBrains/IdeaIC2025.2/options/ide.general.xml`
before each cold start, and **IntelliJ discards that file and rewrites it with
its own content**. After both arms, `SUPPORT_SCREEN_READERS` appears **nowhere**
in the entire config directory, and JetBrains only persists non-default values.

So what was actually measured is both arms running at **the default setting,
which is screen-reader support OFF**. That is weaker than the A/B intended, and
also, arguably, the more useful measurement: it is the state every real user
will be in, since nobody enables screen-reader support unless they need it.

The claim this supports is therefore precise: **IntelliJ IDEA CE 2025.2.5
exposes its editor as a readable `AXTextArea` without the user turning anything
on.** What remains unproven is the counterfactual - whether *turning the knob on*
changes anything - and that no longer blocks the mode mapping, because the
default case is the case that ships.

Two supporting observations:

- `AXManualAccessibility` is `kAXErrorAttributeUnsupported` on IntelliJ, as
  predicted: it is a Chromium mechanism and the JVM is not Chromium. The poke
  is irrelevant here, and harmless.
- A first attempt at this A/B was **invalid and was thrown away**, not reported.
  Opening a loose file raises a modal "Open in Project" chooser; in that run the
  knob-off arm sat on the modal and measured `AXButton` (a Swing *dialog*) while
  the knob-on arm happened to get past it into the editor. The arms were
  measuring different windows. The script now dismisses the modal explicitly
  (`key code 36`) so both arms reach the editor, which is what the table above
  reports.

## The controlled A/B: is the poke required?

**Yes. This is now a clean result.**

| App | Arm A, no poke | Arm B, poke |
| --- | --- | --- |
| Cursor | `kAXErrorNoValue` | `AXWebArea` ("HTML content"), `AXValue` readable, 0 chars |
| Obsidian | `kAXErrorNoValue` | `AXTextField` ("text field"), **`AXValue` readable, 11 chars** |

The #28 A/B was held back by one defect: unequal dwell. VS Code kept reclaiming
focus, so Cursor and Obsidian held focus for roughly **one second** in the
no-poke arm against 13-25 seconds in the poke arm, leaving "a one-second window
is too short for a focused element to exist yet" as a live rival explanation.

`controlled-ab-42.sh` removes it. Each app is held for a **24-second dwell
across 12 re-assertions of activation**, in both arms, so nothing else holds
focus for more than two seconds and the exposure is equal and audited. Arm A
still returned `kAXErrorNoValue` for both apps with 24 seconds of focus. The
rival explanation is dead.

**A confound fired, and it fired in the safe direction.** The script checks that
Wispr Flow actually quit, and it **warned that it had not** - it survived both
the AppleScript quit and `pkill`. Chromium builds its accessibility tree when
*any* AT client asks, so a surviving Wispr Flow biases arm A toward **success**.
Arm A failed anyway. A confound that could only have produced a false positive,
in an arm that came back negative, leaves the conclusion standing rather than
weakening it. (The guard doing its job is why this is stated rather than
guessed - #28 had the same confound and could not see it.)

**One #28 cell is corrected by this run.** #28 listed Obsidian in the known-bad
set, exposing only a container `AXGroup`. With a proper dwell it reports
`AXTextField`, role description "text field", and **reads back all 11 characters
of `hello world`**. Obsidian was a dwell artifact, not a bad app. It comes off
the known-bad list. Cursor stays on it: even with 24 seconds and a successful
poke it reports only `AXWebArea` with 0 characters.

## Answer to the issue

**Detection holds in all three new slots, and the feared third category is not
needed.** The complete known-bad set for field-level detection is now:

| App | Why it is known-bad |
| --- | --- |
| **WhatsApp** | Catalyst. Reports `AXStaticText` on a search field with `AXValue` unreadable - a text surface that denies being one. The worst shape: a plausible wrong answer, not an error. |
| **Cursor** | Container role only (`AXWebArea`, 0 chars) even when poked and given 24s. The helper learns "some web surface", not what kind of field. |
| **Slack** | Same container shape (`AXWebArea`, 0 chars). **See the caveat below - this cell is weaker than the others.** |
| **Terminal.app** | `AXValue` is the entire scrollback, not the input line. |
| **Hyper** | `AXValue` is always empty, so the input line is unreadable a different way. |

Removed from the #28 known-bad set: **Obsidian** (dwell artifact - it works).
Settled as working: **Safari**, **Notes**, **IntelliJ**.

**The Slack caveat, stated plainly because it is the cell the issue cared most
about.** Slack was **signed out** for this run, so what was measured is its
`Sign in | Slack` screen, not a message composer. The reading is a real Electron
reading - the app accepted the poke, and the sign-in screen went from
`kAXErrorNoValue` to `AXWebArea` within one second of it - but **the composer
itself is still unmeasured**. Since the issue's stated reason for caring about
Slack is that "dictating into a chat composer is a daily path", this cell should
be re-run on a signed-in Slack before the field-level mode mapping treats it as
final. It is a five-minute re-run of `field-pass-42.sh` once someone signs in.

**Consequences for the roadmap:**

- The **app-level** half of the per-mode formatting rules (#13) is unblocked and
  was already. Key it on **bundle id, never app name** (see the WhatsApp U+200E
  finding).
- The **field-level** half is now unblocked too, with one open cell (Slack
  composer). The mapping needs **two** categories, not three: works, and
  known-bad. No "user must enable accessibility support" state is required for
  JetBrains at default settings.
- `AXManualAccessibility` should be set **unconditionally on every app**. It is
  required for the Electron apps that accept it, free, a no-op where
  unsupported, and - new in this pass - its return value must **not** be used to
  classify an app, because Hyper rejects it while being Electron.
- #28's headline conclusion is unchanged and now better supported: the modes
  need **a visible indicator and a manual override**, because the failure shape
  across this whole map is not "no answer" but "a plausible wrong answer" -
  WhatsApp's `AXStaticText`, Hyper's empty-but-valid text field, Cursor's
  container role, Terminal's scrollback.

## Housekeeping from these runs

The pass left state on the machine: Slack, Hyper and IntelliJ installed and
running, a Safari window, an untitled Slack sign-in screen, an IntelliJ project
at `~/idea-prototype-scratch` containing `Scratch.java` with `hello world` typed
into it twice, and `hello world` typed into various search fields. Wispr Flow
was asked to quit and did not. IntelliJ's licence and privacy consent were
pre-accepted on disk so the IDE could start unattended.

No tests were written for any of this, per the prototype skill. Anything lifted
out of it into the real native helper gets tests first, as normal.
