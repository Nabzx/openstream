Status: **core question answered.** Neither poke mechanism is what makes context detection work. The real variable is elapsed time since genuine focus, and for Chrome that time is large enough to matter for a product with a sub-1-second latency budget. Not exhaustive (no Slack/Discord data, no tight bound on VS Code's worst case) but decisive enough to redirect the fix.

## Finding 1: neither poke mechanism has ever actually worked

Across every trial - Chrome, Notes, and (in the first, mislabeled pair) Terminal - `AXUIElementSetAttributeValue` for `AXManualAccessibility` and `AXEnhancedUserInterface` returned an error every single time except one: `AXManualAccessibility` succeeded as a *set call* against real VS Code (both retried trials). `AXEnhancedUserInterface` never once succeeded anywhere. And critically, **even where the set call succeeded, that didn't correlate with whether the poll then succeeded** - the poll's outcome tracked something else entirely (see finding 2). `RealAdapters.swift`'s `enableManualAccessibility()` already calls this "unconditional and ignored on failure" - the ignored failures turn out to be the normal case, not an edge case, and the call has likely never once been the reason a query succeeded.

## Finding 2: the real variable is elapsed time since genuine focus, and it's app-dependent

**Chrome, cold click** (baseline `noValue` - genuinely nothing focused yet): the first poll (after the manual-accessibility set, which failed) ran the full 3000ms and never succeeded. The *second* poll (after the enhanced-interface set, which also failed) succeeded on its own after another 2062ms - roughly **5+ seconds total** from the click to a real, non-stub tree (13 nodes) existing. Immediately re-run against the same already-warm tab: instant (0ms). Cmd+Tab-only (no click, but already warm from the prior trial): also instant - this run didn't cleanly isolate "switched but never touched" since the tree was already built.

**VS Code**, both the original opportunistic smoke test and both controlled retries (clicked-in and Cmd+Tab-only): always instant (0ms), always the same small real tree (5 nodes, depth 4). The 3-second grace period before each measurement is enough headroom that this only establishes VS Code's real number is *somewhere under 3 seconds*, not that it's actually instant - but it's clearly nowhere near Chrome's multi-second cold case, and the original real-world reproduction (`AXError -25212` against live VS Code, no grace period) shows it isn't reliably under the current 150ms deadline either.

**Notes** (native, Cocoa, no Chromium involved): instant, real tree (25 nodes), no poke of any kind needed - the control behaves exactly as expected.

## Data

| App | Note | Baseline | Mechanism | Set result | Poll result | Elapsed (ms) | Attempts | Tree nodes | Tree depth | Capped |
|---|---|---|---|---|---|---|---|---|---|---|
| Code | smoke test, VS Code frontmost, focus state unknown | success | axManualAccessibility | success | succeeded | 0 | 1 | 5 | 4 | False |
| Code | smoke test, VS Code frontmost, focus state unknown | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 5 | 4 | False |
| Terminal *(mislabeled - grace period too short on this pair, see below)* | VS Code, clicked into editor | success | axManualAccessibility | attributeUnsupported | succeeded | 0 | 1 | 16 | 4 | False |
| Terminal *(mislabeled)* | VS Code, clicked into editor | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 16 | 4 | False |
| Terminal *(mislabeled)* | VS Code, switched via Cmd+Tab, nothing clicked | success | axManualAccessibility | attributeUnsupported | succeeded | 0 | 1 | 17 | 4 | False |
| Terminal *(mislabeled)* | VS Code, switched via Cmd+Tab, nothing clicked | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 17 | 4 | False |
| Google Chrome | Chrome, clicked into a page text field | noValue | axManualAccessibility | attributeUnsupported | timedOut | - | 246 | - | - | - |
| Google Chrome | Chrome, clicked into a page text field | noValue | axEnhancedUserInterface | notImplemented | succeeded | 2062 | 167 | 13 | 4 | False |
| Google Chrome | Chrome, clicked into a page text field | success | axManualAccessibility | attributeUnsupported | succeeded | 0 | 1 | 13 | 4 | False |
| Google Chrome | Chrome, clicked into a page text field | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 13 | 4 | False |
| Google Chrome | Chrome, switched via Cmd+Tab, nothing clicked | success | axManualAccessibility | attributeUnsupported | succeeded | 0 | 1 | 13 | 4 | False |
| Google Chrome | Chrome, switched via Cmd+Tab, nothing clicked | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 13 | 4 | False |
| Notes | TextEdit, clicked into document | success | axManualAccessibility | attributeUnsupported | succeeded | 0 | 1 | 25 | 4 | False |
| Notes | TextEdit, clicked into document | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 25 | 4 | False |
| Code | VS Code, clicked into editor, retry | success | axManualAccessibility | success | succeeded | 0 | 1 | 5 | 4 | False |
| Code | VS Code, clicked into editor, retry | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 5 | 4 | False |
| Code | VS Code, switched via Cmd+Tab, nothing clicked, retry | success | axManualAccessibility | success | succeeded | 0 | 1 | 5 | 4 | False |
| Code | VS Code, switched via Cmd+Tab, nothing clicked, retry | success | axEnhancedUserInterface | notImplemented | succeeded | 0 | 1 | 5 | 4 | False |

The "Terminal" rows are a real methodology hazard worth keeping, not deleting: the operator's first two attempts at the corrected (post-grace-period) workflow still landed on Terminal, because 3 seconds wasn't enough time on unfamiliar first tries. Both were cleanly re-run once the workflow was familiar; the retried rows are the valid VS Code data.

## What this means for #10

A retry loop with a bigger constant is not the fix - Chrome's real number (5+ seconds observed on one cold trial) is fundamentally incompatible with a sub-1-second dictation latency budget, no matter how generous the retry window is. Recommended direction: treat AX-context-detection readiness the same way the injection engine's own `settleBudgetMs` guard already treats target stability (see `../injection-thresholds-74`) - wait up to a short, product-chosen budget (on the order of what's already spent elsewhere in the pipeline, not seconds), and if the target hasn't become AX-ready by then, fall back to a different rung (a blind paste, or treating it as a one-line/unknown-context field) rather than holding up delivery. The poke calls (`AXManualAccessibility`/`AXEnhancedUserInterface`) are safe to keep issuing since they're harmless when ignored, but nothing here supports relying on them.

## Still open

- No Slack/Discord data - would help establish whether Chrome's multi-second cold case is a full-browser thing specifically or general to any Chromium-based surface including Electron's own.
- VS Code's real number is only bounded as "under 3 seconds," not measured tightly - the original production reproduction (`-25212` against real VS Code with no grace period) proves it's sometimes above the current 150ms deadline, but exactly how far above isn't pinned down here.
