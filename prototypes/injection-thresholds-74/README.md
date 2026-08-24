# Injection timing prototype — issue #74

**Throwaway measurement harness. It is not production helper code.**

## Question

What values should replace the placeholder `settleMs`, `stableForBlindPasteMs`, and `settleBudgetMs` guards in the injection state machine? The harness measures the clocks behind that decision: an activation request, the `NSWorkspace` activation notification, observation of the expected frontmost application, and the first successful focused-element query through Accessibility.

Timing data cannot establish that a human is looking at a window. It can bound how long the machine takes to name and expose the target. Choosing how much additional safety `stableForBlindPasteMs` needs remains a product-risk decision.

## Machine this protocol was designed for

- MacBook Air (Mac15,12)
- Apple M3
- 16 GB RAM
- macOS 15.6.1 (24G90)

The stressed pass below is a proxy on this machine, **not evidence from an 8 GB or older Mac**.

## Before running

1. Quit other accessibility clients that may alter Chromium's accessibility tree.
2. Open these apps and put each one on a representative editable surface. Leave that field focused before switching away:
   - Terminal
   - TextEdit
   - Notes
   - Safari
   - Google Chrome
   - Visual Studio Code
   - Cursor
   - Obsidian
   - Slack
   - WhatsApp
3. Run from Terminal. Terminal must have Accessibility permission. The probe prints whether it is trusted.
4. Do not use the Mac during an automated pass. The sweep deliberately takes focus.

The probe sets `AXManualAccessibility` on every activated app. It is required for fresh Electron processes and is a no-op or a reported error elsewhere.

## Pass 1: automated, idle

```bash
cd prototypes/injection-thresholds-74
./run.sh automated idle
```

Default protocol: 10 apps × 20 switches, with four seconds of dwell after each target activation. Expect roughly 17 minutes. For a smoke run only:

```bash
REPETITIONS=1 DWELL_MS=1000 ./run.sh automated idle
```

## Pass 2: automated, stressed

```bash
./run.sh automated stressed
```

This adds four CPU workers and allocates/touches 2 GiB while repeating the same sweep. Cleanup is automatic on normal exit, Ctrl-C, or termination.

## Pass 3: manual switching

```bash
./run.sh manual idle
```

Use Cmd+Tab and window clicks. Visit each of the ten prepared apps at least five times, varying pace:

1. switch and immediately click/type;
2. switch, pause briefly, then click/type;
3. switch rapidly through two apps before stopping on the target.

Press Ctrl-C when finished. The manual pass has no synthetic activation-request marker, but activation-to-AX readiness remains measurable.

## Analyze

```bash
./analyze.py logs/*.jsonl > RESULTS.md
open RESULTS.md
```

The report gives per-app and overall p50, p95, p99, and maximum values for:

- activation request → `NSWorkspace` activation;
- activation request → expected frontmost app observed;
- `NSWorkspace` activation → focused AX element ready;
- successful AX query duration;
- five-second AX timeouts and missing matching notifications.

## How the evidence maps to the guards

- **`settleMs`**: choose above the activation-to-AX tail plus an explicit margin. This is the minimum age before querying/delivering against the target.
- **`stableForBlindPasteMs`**: must be at least as conservative as `settleMs`, then add the product's safety margin for an unconfirmed field. The data cannot prove where the user is looking.
- **`settleBudgetMs`**: choose above reliable AX readiness but below the point where waiting is worse than holding the transcript on the overlay.

Do not pick values from the idle mean. The guard exists for the tail. Compare idle, stressed, and manual distributions, inspect every timeout, then make the tradeoff explicitly.

## Capture

Keep this harness, raw logs, and `RESULTS.md` on the throwaway `prototype/injection-thresholds-74` branch. The resolution comment on **What are the real settle and stability thresholds that guard injection?** holds the answer. Main should receive only the validated threshold decision when implementation begins.
