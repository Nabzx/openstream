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

## The one decision the demo deliberately refuses to make

The **"paste anyway when the app will not say what is focused"** switch, off by
default. Off, a hung app means the text is held on the overlay. On, it pastes
into a window nobody has confirmed anything about. This is the product's central
tradeoff - annoying versus lost - and the demo exists to make someone feel both
sides before choosing. Run the "app has hung" walkthrough twice, once each way.

## What this cannot settle

- **The actual threshold values.** 400 ms and 1,200 ms are placeholders. Real
  numbers need the activation-timestamp signal designed in #44 and left unbuilt,
  measured against real app switches.
- **Whether apps behave as modelled.** The four field kinds are drawn from #28's
  measurements; "the app ignores synthesised paste" is drawn from the issue text
  and is not measured anywhere yet.
- **Latency.** Nothing here is timed against a real AX call.
