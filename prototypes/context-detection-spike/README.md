# Context-detection spike (issue #28)

PROTOTYPE. Throwaway code that answers one question. Not a native helper, not
production, no tests, do not build on this file.

## The question

Can the frontmost app and the focused field type be detected reliably enough,
across the apps developers actually use, for context-awareness to carry the
product? The useful output is not "it works" but a map of where it fails,
because that decides whether the per-mode formatting can be trusted silently
or needs a visible indicator and a manual override.

This is neither of the prototype skill's two standard shapes (a clickable state
model, or UI variants). The question is empirical and about a real OS API
against real apps, so the artifact is an instrumentation probe instead.

## What the probe measures

Two layers, recorded separately, because they fail for different reasons:

1. **Frontmost app** via `NSWorkspace.shared.frontmostApplication`. Needs no
   permission at all.
2. **Focused element** via `AXUIElementCopyAttributeValue(..., kAXFocusedUIElementAttribute)`.
   Needs Accessibility trust, and needs the app to actually publish an
   accessibility tree.

For the focused element it records `AXRole`, `AXSubrole`, `AXRoleDescription`,
the focused title, the window title, whether `AXValue` and `AXSelectedText` are
readable, and on failure **the exact `AXError`**. The error code is the answer,
not noise: `kAXErrorAPIDisabled` (we are not trusted), `kAXErrorNoValue`
(nothing focused), `kAXErrorCannotComplete` (app did not answer),
`kAXErrorAttributeUnsupported` (app has no such concept) are four different
verdicts with four different product consequences.

`--poke` additionally sets `AXManualAccessibility` on the frontmost app before
reading it. Chromium and Electron apps withhold their accessibility tree until
something asks; whether this knob flips VS Code and the Electron chat apps is
the single check most likely to decide the issue.

Chromium builds that tree **asynchronously** after the flag is set, so a read in
the same breath as the poke shows nothing even when the poke worked. The probe
pokes each app once and waits a second before its first read for that app. Do
not judge the knob from `--poke --once` on a cold app: that combination produces
a false negative, which is the exact opposite of the truth.

## Running it

```sh
./run.sh            # poll every 400ms, print on change, tee into logs/
./run.sh --poke     # same, with AXManualAccessibility set per app
./run.sh --prompt   # trigger the Accessibility permission prompt first
./sweep.sh          # activate a list of apps in turn, so the app-level half
                    # of the map collects itself while the probe runs
swift probe.swift --once   # single sample
```

The probe prints `AXIsProcessTrusted()` on startup. If that is `false`, every
focused-element read returns `kAXErrorAPIDisabled` and the run tells you
nothing about the apps.

**Whatever app launches the probe is the process that needs the grant**, not
the probe itself. The reliable route is to run `./run.sh --prompt` from
Terminal.app, approve the prompt, and grant Terminal under
System Settings > Privacy & Security > Accessibility.

Field focus mostly needs a human clicking into a real text field. `sweep.sh`
only automates which app is in front, plus whatever focus an app lands on by
itself when activated.

## Results

See [RESULTS.md](RESULTS.md).

---

# Second pass (issue #42)

Same probe, wider app set. [Issue #28](https://github.com/Nabzx/openstream/issues/28)
answered the thesis-level question and is closed; that verdict does not change
here. What #42 measures is the **field-level** behaviour in three app slots that
were not installed on the test machine, plus two re-runs to settle cells that
failed for test-artifact reasons rather than app reasons.

## The three new slots, and why each is a distinct unknown

- **Slack.** The one genuine Electron chat app. WhatsApp was tried as a stand-in
  in #28 and turned out to be native (Catalyst) - it rejects
  `AXManualAccessibility` the way Terminal and Finder do - so it never stood in
  for Slack at all. Slack is also where a wrong mode is most visible, since
  dictating into a chat composer is a daily path.
- **A JetBrains IDE.** Its editor is Swing, not Chromium, and Swing publishes an
  accessibility tree only when the IDE's own "Support screen readers" option is
  on. macOS Accessibility trust does not reach it and neither does
  `AXManualAccessibility`. That makes **"works only if the user turns a knob on"
  a third answer** alongside works and fails, and neither the results map nor
  the planned mode mapping has a place for it yet.
- **A standalone Electron terminal** (Hyper). Native Terminal.app returned the
  entire scrollback in `AXValue` rather than the input line. Whether an Electron
  terminal repeats that shape, or fails differently, decides how general the
  terminal caveat is.

## The two re-runs, and the defect each one fixes

Both #28 cells failed for the same underlying reason - **an app held focus for
about one second** - and the fix is the same in both. A longer `sleep` does not
help, because focus is lost during it. Instead these scripts **re-assert
activation every two seconds across the dwell window**, so nothing else can hold
focus for more than two seconds, and they print the re-assertion count so the
dwell is auditable rather than assumed.

- `focus-retry-42.sh` settles **Safari, Notes and WhatsApp**. Those cells came
  back `kAXErrorNoValue` in #28 only because a person was actively using Chrome
  on the same machine and Chrome reclaimed focus within a second each time. The
  window title was also `kAXErrorNoValue` in those samples, meaning the app had
  no focused window at that instant - a test artifact, not an app verdict.
- `controlled-ab-42.sh` turns "`AXManualAccessibility` **appears** required" into
  a result that can be stated plainly. The #28 A/B gave its two arms unequal
  exposure: VS Code hosts the session driving the probe and kept reclaiming
  focus, so Cursor and Obsidian held focus for roughly one second in the no-poke
  arm against 13-25 seconds in the poke arm. A one-second window may simply be
  too short for a focused element to exist yet, which is a rival explanation for
  the no-poke failures.

## Running the second pass

`AXIsProcessTrusted()` must be `true`, and **the process that needs the grant is
whatever launched the probe**, not the probe. Terminal.app was granted during
#28 and still holds it, so run everything from Terminal.app.

```sh
./run.sh --poke              # window 1: probe polling, tee into logs/
./sweep-42.sh                # window 2: layer 1 over the new app set
./field-pass-42.sh           #           layer 2, focus into each new app
./focus-retry-42.sh          #           settle Safari / Notes / WhatsApp
./controlled-ab-42.sh        #           A/B with equal, audited dwell
./jetbrains-knob-ab.sh       #           the third-category test
```

`jetbrains-knob-ab.sh` drives both arms without a human by writing the knob to
disk and cold-restarting the IDE:

```
~/Library/Application Support/JetBrains/IdeaIC*/options/ide.general.xml
  <option name="SUPPORT_SCREEN_READERS" value="true|false" />
```

The setting is read at startup only, hence the full quit and relaunch per arm.
IntelliJ still has to be launched **once by hand** first, past the licence
agreement and the first-run wizard, and left with a project and a file open in
the editor. That part is not worth automating for a throwaway probe.

## Results

See [RESULTS-42.md](RESULTS-42.md).
