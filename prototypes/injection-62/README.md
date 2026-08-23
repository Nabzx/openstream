# Injection prototype (issue #62)

PROTOTYPE. Throwaway code that answers one question. Not a helper, not
production, no tests, do not build on this file.

## The question

When the user releases the hotkey, how does the transcribed text reliably end up
in the field they were pointing at? Concretely, the three sub-questions issue #62
opens:

1. One injection mechanism, or a fallback chain - and what triggers each rung?
2. What defends against a stale target, given #28 measured the frontmost app
   being reported one to three seconds late in six of eighteen samples?
3. What does the user see when injection fails or times out?

## Why this shape

This is the prototype skill's **logic** branch, not the instrumentation shape
used in #28 and #42. Nothing here needs measuring against a real OS API: the
measurements already exist in `prototypes/context-detection-spike/RESULTS.md`,
and what is unsettled is the **decision procedure** built on top of them. A
decision procedure is a state machine, and the cheapest way to find out whether
a state machine is wrong is to push it through awkward cases by hand.

So: one self-contained HTML file. Open it, click buttons, watch the state.

```sh
open prototypes/injection-62/index.html
```

No install, no server, no build. It can be emailed to someone who does not have
the repo.

## What is inside

`index.html` holds two things that must not be confused:

- **The module under test** - `InjectionModel`, a pure reducer
  `(state, action) => state` at the top of the `<script>` block. No DOM, no
  timers: time is an input (`TIME_PASSES`), so every run is reproducible. This is
  the part worth lifting into the real code once the decision is made.
- **The page** - a thin shell that renders state and wires buttons. Throwaway.

Drive it two ways: **free play** (every action, always available, in any order)
and **eight guided walkthroughs**, one per tab, each resetting to a known world
and stepping through one awkward case.

## The answer the model proposes

Everything below is encoded in the reducer, so it can be argued with by clicking
rather than by reading.

**A chain, not one mechanism.** Three rungs, each with a trigger that is
detectable rather than assumed:

| Rung | Trigger to use it | Cost |
|---|---|---|
| Write `AXValue` at the caret | field is writable, readable, and its current value is under 2,000 characters | none - atomic, clipboard untouched |
| Clipboard plus synthesised paste | the field is not writable (`AXWebArea`, `AXGroup`), or its value is scrollback-sized | borrows the clipboard for ~300 ms |
| Synthesised keystrokes | the app ignored the paste | slow; drops and reorders on long text |

The scrollback trigger is the load-bearing one. #28 measured terminals returning
5,673 to 15,646 characters as their value, so **"the value is larger than a field
could plausibly hold" is the detectable signal that rung 1 must refuse itself.**
Without it, rung 1 replaces a terminal's scrollback with one sentence.

**Against the stale target: a settle guard, not a caret query.** Delivery is
blocked while the last frontmost-app change is younger than `settleMs`
(default 400). If the app switch is fresh, the machine waits rather than asking a
possibly-stale pid where its caret is. If the front app keeps changing and no
target settles inside `settleBudgetMs` (default 1,200), the text is **held, not
guessed**. The two numbers are the ticket's unmeasured thresholds and are exposed
as a slider precisely because the demo cannot settle them - see below.

**On failure: hold, never guess.** Every failure path ends in the overlay box
that #44 already settled, with the transcript intact and the clipboard untouched
until the user explicitly presses copy. Three distinct paths reach it: nothing
focused, the app never answered, and the target never settled. #26 makes the
second of these expected rather than exceptional.

**Delivery is reported honestly.** The state panel separates "we delivered it"
from "anything confirmed it arrived", because for Electron editors and terminals
nothing can. That distinction was a modelling error caught by running the model:
the first draft reported a paste into a terminal as verified, on the grounds that
its value was readable - but what is readable there is the scrollback, which
proves nothing about the line the user is on.

## The decision the demo forced, now settled

The demo shipped with a **"paste anyway when the app will not say what is
focused"** switch, off by default, and refused to choose. That choice has now
been made, and it is neither on nor off: **we never paste into a window we
cannot name, but a known window that has stood still is not an unknown window.**

The framing the issue opened with - "annoying versus lost" - did not survive.
Issue #44 had already settled the overlay box as the catch-all, so with the
switch off the text is not *lost*; it is sitting in front of the user, one
keystroke from the clipboard. What a blind paste actually risks is not recovering
a lost transcript, it is **replacing a selection in a window nobody confirmed** -
destroying text the user already had. The overlay path destroys nothing. So the
default is: **hold.**

The exception turns on separating two unknowns that the first draft ran together:

| What we don't know | What that implies | What we do |
|---|---|---|
| Which app is frontmost | #28 measured the frontmost app arriving 1-3 s late in 6 of 18 samples. The user may not be looking at the window we would paste into at all. | **Hold** on the overlay |
| Which *field* is focused, in an app we can name that has been still for a long time | The user is demonstrably looking at this window. A wrong paste lands somewhere they can see, and can undo. | **Paste**, reported unverified |

That is rung 1b, gated on `stableForBlindPasteMs` (default 800). It is
deliberately **twice** `settleMs` (400), because the two thresholds answer
different questions: the settle guard asks *has the target stopped moving*, the
stability gate asks *have we watched it stand still long enough to believe the
user is looking at it*. Set the option to `null` to remove the rung entirely; the
machine then holds on every unanswered focus query.

Two consequences fall out of the same reasoning:

- **The blind rung does not fall through to typing.** If the app swallows the
  paste, the machine holds. One atomic paste into a watched window is a bounded,
  undoable mistake; typing a sentence character by character into a field we
  could not identify is not, since a vim mode or an autocomplete turns it into
  arbitrary input.
- **It is never reported as verified.** Delivery reads "pasted into a known
  window, field unknown" - the honest-reporting split the demo already had.

Two walkthroughs show the contrast directly: **The app has hung** (still for
ages, so it pastes) and **Hung, and just switched to** (under the gate, so it
holds, clipboard untouched).

## What this cannot settle

- **The actual threshold values.** 400 ms, 800 ms and 1,200 ms are all
  placeholders, and the 800 ms stability gate is the newest and least defensible
  of them - it is "twice the settle guard" and nothing more. Real
  numbers need the activation-timestamp signal designed in #44 and left unbuilt,
  measured against real app switches.
- **Whether apps behave as modelled.** The four field kinds are drawn from #28's
  measurements; "the app ignores synthesised paste" is drawn from the issue text
  and is not measured anywhere yet.
- **Latency.** Nothing here is timed against a real AX call.
