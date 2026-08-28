import Testing
import AccessibilityInjection

// Regression coverage for the fallback chain settled in #62 and ported to
// real AX calls in #6 - see #10, which asked for injection to be hardened
// against real cross-app failures. This suite can't replace testing
// against real apps (that still needs a human - see
// docs/testing/hotkey-transcribe-manual-check.md), but every branch here
// previously had zero automated coverage.
struct InjectionEngineTests {
    let config = Config()

    func makeEngine(
        focusTarget: AccessibilityTarget?,
        missesBeforeSuccess: Int = 0,
        pasteResult: PasteResult = PasteResult(delivered: true, verified: false, note: ""),
        trackerAge: @escaping () -> Double = { 10_000 },
        appName: String? = "TestApp"
    ) -> (engine: InjectionEngine, time: SimulatedTime, paster: FakePaster, typer: FakeTyper) {
        let time = SimulatedTime()
        let paster = FakePaster(result: pasteResult)
        let typer = FakeTyper()
        let tracker = FakeTracker(age: trackerAge, appName: appName)
        let engine = InjectionEngine(
            config: config,
            focusResolver: FakeFocusResolver(target: focusTarget, missesBeforeSuccess: missesBeforeSuccess),
            paster: paster,
            typer: typer,
            tracker: tracker,
            sleep: time.sleep,
            now: time.now,
            log: { _ in }
        )
        return (engine, time, paster, typer)
    }

    // MARK: - Rung 1: write at the caret

    @Test func rung1WritesAtCaretWhenFieldIsSettableAndSmall() {
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 10, selectedTextSettable: true)
        )
        let (engine, _, paster, _) = makeEngine(focusTarget: target)

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "wrote into the field", verified: true, note: "inserted at the caret, clipboard untouched"))
        #expect(target.writtenText == "hello")
        #expect(paster.callCount == 0, "rung 1 succeeded, rung 2 should never fire")
    }

    @Test func rung1RefusesAScrollbackSizedField() {
        // A terminal: settable in principle, but #28 measured 5,673-15,646
        // characters of scrollback as its "value" - rung 1 must refuse.
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextArea", valueChars: 9412, selectedTextSettable: true)
        )
        let (engine, _, paster, _) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed")
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "pasted", verified: false, note: "sent, but nothing confirmed it landed"))
        #expect(target.writtenText == nil, "rung 1 must not have attempted to write into scrollback")
        #expect(paster.callCount == 1)
        #expect(paster.lastVerifyAgainst == nil, "the value is too large to be a field, so it can't be verified either")
    }

    @Test func rung1FallsThroughToPasteWhenTheWriteItselfFails() {
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 10, selectedTextSettable: true),
            writeSucceeds: false
        )
        let (engine, _, paster, _) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: true, verified: true, note: "read back and confirmed")
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "pasted", verified: true, note: "read back and confirmed"))
        #expect(paster.callCount == 1)
    }

    // MARK: - Rung 2: clipboard + paste

    @Test func rung2IsUnverifiedForAnUnreadableField() {
        // AXWebArea/AXGroup: not settable, value unreadable - exactly what
        // #28 measured for Electron apps without AXManualAccessibility.
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXWebArea", valueChars: nil, selectedTextSettable: false)
        )
        let (engine, _, paster, _) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed")
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "pasted", verified: false, note: "sent, but nothing confirmed it landed"))
        #expect(paster.lastVerifyAgainst == nil, "an unreadable field can never be verified")
    }

    // MARK: - Rung 3: synthesised keystrokes

    @Test func rung3FiresOnlyWhenRung2WasVerifiableAndDemonstrablyFailed() {
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 10, selectedTextSettable: false)
        )
        let (engine, _, _, typer) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: false, verified: false, note: "the app did not accept the paste")
        )

        let outcome = engine.decide(text: "hello")

        guard case .delivered(let method, let verified, _) = outcome else {
            Issue.record("expected delivered, got \(outcome)")
            return
        }
        #expect(method == "typed character by character")
        #expect(!verified)
        #expect(typer.typedText == "hello")
    }

    @Test func rung3NeverFiresForAPasteThatCouldNotBeVerifiedInTheFirstPlace() {
        // A paste into a field we could never read back has no positive
        // evidence it failed. #62/#10: don't guess-retry with keystrokes
        // into an unidentified field - a vim mode or autocomplete can turn
        // that into arbitrary input.
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXWebArea", valueChars: nil, selectedTextSettable: false)
        )
        let (engine, _, _, typer) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed")
        )

        _ = engine.decide(text: "hello")

        #expect(typer.typedText == nil)
    }

    @Test func longTextTypedBlindGetsAWarningNote() {
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 10, selectedTextSettable: false)
        )
        let (engine, _, _, _) = makeEngine(
            focusTarget: target,
            pasteResult: PasteResult(delivered: false, verified: false, note: "the app did not accept the paste")
        )
        let longText = String(repeating: "a", count: config.longTextChars + 1)

        let outcome = engine.decide(text: longText)

        guard case .delivered(_, _, let note) = outcome else {
            Issue.record("expected delivered, got \(outcome)")
            return
        }
        #expect(note.contains("typed blind"), "note was: \(note)")
    }

    // MARK: - Rung 0: focus resolution retry (#227)

    @Test func retriesFocusResolutionWhenTheAXTreeWasBrieflyNotReady() {
        // The Electron/#28 case: AXManualAccessibility was just set and the
        // first read misses, but the tree comes good a beat later. Before
        // #227 this dropped straight to blind-paste-or-hold.
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 10, selectedTextSettable: true)
        )
        let (engine, time, paster, _) = makeEngine(focusTarget: target, missesBeforeSuccess: 2)

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "wrote into the field", verified: true, note: "inserted at the caret, clipboard untouched"))
        #expect(target.writtenText == "hello")
        #expect(paster.callCount == 0, "rung 1 should have succeeded once the retry resolved the field")
        #expect(time.elapsedMs <= config.axInjectBudgetMs, "the retry must stay inside its budget")
    }

    @Test func focusRetryGivesUpAtTheBudgetAndFallsBackAsBefore() {
        // Never resolves: the retry must not spin past its budget, and the
        // fallback (blind paste into a known, stable app) is unchanged.
        let (engine, time, paster, _) = makeEngine(
            focusTarget: nil,
            missesBeforeSuccess: 999,
            pasteResult: PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed"),
            appName: "SomeApp"
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "pasted into SomeApp, field unknown", verified: false, note: "sent, but nothing confirmed it landed"))
        #expect(paster.callCount == 1)
        #expect(time.elapsedMs >= config.axInjectBudgetMs, "should have waited out the whole budget before giving up")
    }

    // MARK: - Rung 0 / 1b: focus never resolved

    @Test func holdsWhenNothingIsFocusedAndTheAppNeverAnswered() {
        let (engine, _, paster, _) = makeEngine(focusTarget: nil, appName: nil)

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .held(reason: "the frontmost app never said what was focused, and hasn't been stable long enough to paste blind"))
        #expect(paster.callCount == 0)
    }

    @Test func pastesBlindIntoAKnownAppThatHasBeenStableLongEnough() {
        let (engine, _, paster, _) = makeEngine(
            focusTarget: nil,
            pasteResult: PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed"),
            trackerAge: { 10_000 }, // well past stableForBlindPasteMs (800ms default)
            appName: "SomeHungApp"
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "pasted into SomeHungApp, field unknown", verified: false, note: "sent, but nothing confirmed it landed"))
        #expect(paster.callCount == 1)
        #expect(paster.lastVerifyAgainst == nil, "a blind paste never has a target to verify against")
    }

    @Test func holdsInsteadOfBlindPasteWhenNotStableLongEnough() {
        // Past the settle guard (400ms default) so rung 0 is reached at
        // all, but short of stableForBlindPasteMs (800ms default).
        let (engine, _, paster, _) = makeEngine(focusTarget: nil, trackerAge: { 500 }, appName: "SomeApp")

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .held(reason: "the frontmost app never said what was focused, and hasn't been stable long enough to paste blind"))
        #expect(paster.callCount == 0)
    }

    // MARK: - Settle guard

    @Test func settleGuardHoldsWhenTheFrontAppNeverStabilizes() {
        // Age is pinned at 50ms forever - simulates the app switching
        // again on every check, so the settle guard (400ms) never passes
        // and the settle budget (1200ms of simulated waiting) runs out.
        let (engine, time, paster, _) = makeEngine(focusTarget: nil, trackerAge: { 50 })

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .held(reason: "the front app kept changing, so we never trusted a target"))
        #expect(paster.callCount == 0)
        #expect(time.elapsedMs >= config.settleBudgetMs)
    }

    @Test func settleGuardPassesOnceTheTargetStabilizes() {
        let time = SimulatedTime()
        let target = FakeAccessibilityTarget(
            fieldInfo: FieldInfo(role: "AXTextField", valueChars: 5, selectedTextSettable: true)
        )
        let paster = FakePaster(result: PasteResult(delivered: true, verified: false, note: ""))
        let typer = FakeTyper()
        // Age grows with simulated time from 0, so it crosses settleMs
        // (400ms default) after real polling, not immediately.
        let tracker = FakeTracker(age: { time.elapsedMs }, appName: "TestApp")
        let engine = InjectionEngine(
            config: config,
            focusResolver: FakeFocusResolver(target: target),
            paster: paster,
            typer: typer,
            tracker: tracker,
            sleep: time.sleep,
            now: time.now,
            log: { _ in }
        )

        let outcome = engine.decide(text: "hello")

        #expect(outcome == .delivered(method: "wrote into the field", verified: true, note: "inserted at the caret, clipboard untouched"))
        #expect(time.elapsedMs >= config.settleMs)
        #expect(time.elapsedMs < config.settleBudgetMs, "should have settled well before the budget ran out")
    }
}
