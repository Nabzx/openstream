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
