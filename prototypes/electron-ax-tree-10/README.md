# Electron/Chromium accessibility tree prototype — issue #10

**Throwaway measurement harness. It is not production helper code.**

## Question

`RealAdapters.swift`'s `resolveFocusedElement` calls `AXUIElementSetAttributeValue(appElement, "AXManualAccessibility", true)` once, then immediately queries `kAXFocusedUIElementAttribute` with no retry. Against VS Code this returned `AXError -25212` (`kAXErrorNoValue`). Ad hoc probing during the #10 investigation found:

- Against Chrome, polling every 10ms for a full 2 seconds after setting `AXManualAccessibility` **never** succeeded, and the window element still reported only 1 child afterward.
- [electron/electron#37465](https://github.com/electron/electron/issues/37465) documents `AXManualAccessibility` as broken on Electron specifically - Electron never advertises the attribute exists to the accessibility API, so the set call can silently no-op. The same issue names a private alternative, `AXEnhancedUserInterface` (what VoiceOver uses), with unspecified "unwanted side effects."
- One ad hoc test of `AXEnhancedUserInterface` against VS Code had the *set call itself* fail (`kAXErrorNotImplemented`), yet the very next poll succeeded in under 1ms - with the tree still only 1 child deep. That's consistent with "a leaf was already genuinely focused from real prior interaction," not with either mechanism doing anything.

None of that was collected under controlled, repeatable conditions - it was live probing of whatever happened to be on screen. This harness exists to answer, properly:

1. Does `AXManualAccessibility` or `AXEnhancedUserInterface` reliably unlock a **real, navigable tree** (not just make one leaf query succeed) on a Chromium/Electron target, and how long does it take when it works at all?
2. Does success depend on the target already having a genuinely focused, interacted-with element - independent of either mechanism - rather than on the poke itself?
3. Does behavior differ between a full multi-process browser (Chrome) and an Electron-packaged app (VS Code, Slack, Discord)?

"Tree richness" = starting from the focused element's containing window, a breadth-first walk of `kAXChildrenAttribute` capped at 50 nodes / 4 levels deep. A stub tree reports 1-2 nodes even capped; a real one reports dozens+.

## Before running

1. Terminal must have Accessibility permission (the probe prints whether it's trusted).
2. Have your target apps open with something genuinely interactable - not just frontmost, but **actually clicked into a real text field or the editor pane** - since question 2 above is specifically about whether that matters.

## Running a trial

One trial = one app, one mechanism, run right after you've clicked into a real field in it:

```bash
cd prototypes/electron-ax-tree-10

# click into VS Code's editor first, then:
./run.sh manual "VS Code, clicked into editor"
./run.sh enhanced "VS Code, clicked into editor"

# click into Chrome's page content first, then:
./run.sh both "Chrome, clicked into a text input on a real page"

# a native app as a control - should succeed immediately with no poke needed:
./run.sh none "TextEdit, clicked into the document"
```

Every run appends one trial to `logs/session.jsonl`. Cover at minimum: VS Code and Chrome (both `manual` and `enhanced`), one native app as a control, and - if available - Slack and/or Discord as a second and third Electron data point distinct from VS Code.

Worth at least one deliberate test of question 2: switch to an Electron app **without** clicking anything inside it first (just Cmd+Tab, don't touch the window), then immediately run a trial. Compare against the same app with a genuine prior click.

## Analyze

```bash
./analyze.py logs/session.jsonl > RESULTS.md
```

## Capture

Keep this harness, raw logs, and `RESULTS.md` on the throwaway `prototype/electron-ax-tree-10` branch, same convention as `../injection-thresholds-74`. The resolution comment on issue #10 holds the answer; main should only receive the validated fix once one exists.
