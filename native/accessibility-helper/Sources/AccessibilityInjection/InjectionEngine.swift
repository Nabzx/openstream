import Foundation

// The decision procedure itself, ported from InjectionModel in
// prototypes/injection-62/index.html onto real AX/CGEvent calls (see #6),
// then pulled behind the protocols in Protocols.swift so it can be tested
// without a live AX tree (#10). `sleep` and `now` are injected rather than
// called directly - "time is an input", the same principle the #62
// prototype used to make the settle guard reproducible.
public final class InjectionEngine {
    private let config: Config
    private let focusResolver: FocusResolving
    private let paster: ClipboardPasting
    private let typer: KeyTyping
    private let tracker: AppSwitchTracking
    private let sleep: (TimeInterval) -> Void
    private let now: () -> Date
    private let log: (String) -> Void

    public init(
        config: Config,
        focusResolver: FocusResolving,
        paster: ClipboardPasting,
        typer: KeyTyping,
        tracker: AppSwitchTracking,
        sleep: @escaping (TimeInterval) -> Void = { Thread.sleep(forTimeInterval: $0) },
        now: @escaping () -> Date = Date.init,
        log: @escaping (String) -> Void = { _ in }
    ) {
        self.config = config
        self.focusResolver = focusResolver
        self.paster = paster
        self.typer = typer
        self.tracker = tracker
        self.sleep = sleep
        self.now = now
        self.log = log
    }

    public func decide(text: String) -> InjectionOutcome {
        // Settle guard: never trust a target while the last app switch is
        // more recent than settleMs. Poll rather than trust a single
        // reading, since the tracker updates asynchronously in production.
        let deadline = now().addingTimeInterval(config.settleBudgetMs / 1000.0)
        while tracker.ageMs() < config.settleMs {
            if now() >= deadline {
                return .held(reason: "the front app kept changing, so we never trusted a target")
            }
            sleep(0.02)
        }

        // Resolve the focused element, retrying a not-yet-ready AX tree
        // within a short budget (#227). #181 gave context detection this
        // same treatment; the injection path had none, so an Electron
        // target whose tree wasn't up on the first read (VS Code, Slack -
        // the #28 case, common when OpenStream itself was launched from an
        // IDE terminal) fell straight through to blind-paste-or-hold. Each
        // attempt is still capped by axDeadlineMs; the retry only costs
        // latency when the first read actually missed.
        let focusDeadline = now().addingTimeInterval(config.axInjectBudgetMs / 1000.0)
        var resolved = focusResolver.resolveFocusedElement(deadlineMs: config.axDeadlineMs)
        while resolved == nil, now() < focusDeadline {
            sleep(0.04)
            resolved = focusResolver.resolveFocusedElement(deadlineMs: config.axDeadlineMs)
        }

        guard let focused = resolved else {
            // Rung 0 didn't answer, or nothing is frontmost at all. The
            // narrow exception settled on #62: a known app that has sat
            // still well past the settle guard is a much smaller unknown
            // than "which app" - the user is demonstrably looking at it,
            // so a blind paste there is a bounded, undoable mistake rather
            // than a shot in the dark. We have no app name at all when
            // nothing is frontmost, so that case always falls through to
            // hold below.
            if let gate = config.stableForBlindPasteMs, tracker.ageMs() >= gate,
               let appName = tracker.currentFrontmostName() {
                let result = paster.paste(text: text, verifyAgainst: nil)
                return .delivered(method: "pasted into \(appName), field unknown", verified: false, note: result.note)
            }
            return .held(reason: "the frontmost app never said what was focused, and hasn't been stable long enough to paste blind")
        }

        let info = focused.fieldInfo
        let readableAndFieldSized = info.valueChars.map { $0 <= config.axValueMaxChars } ?? false
        // #368: Google Docs and other browser editors render to a canvas and
        // manage input themselves - an AX write returns .success and does
        // nothing. Skip rung 1 there and paste.
        let pasteFirst = (tracker.currentFrontmostBundleId()).map(config.pasteFirstBundleIds.contains) ?? false

        // Rung 1: write straight into the field. An AX write that returns
        // .success is not proof the text arrived (#368), so read the field
        // back and confirm before trusting it.
        if !pasteFirst && info.selectedTextSettable && readableAndFieldSized {
            if focused.writeAtCaret(text), let after = focused.readValue(), after.contains(text) {
                return .delivered(method: "wrote into the field", verified: true, note: "inserted at the caret, clipboard untouched")
            }
            log("rung 1 write did not confirm (settable role \(info.role)); falling back to paste")
        } else if !pasteFirst && info.selectedTextSettable, let chars = info.valueChars, chars > config.axValueMaxChars {
            log("refusing to write into \(info.role) - \(chars) characters of existing content looks like scrollback, not a field")
        }

        // Rung 2: clipboard + paste.
        // #368: give a browser editor a beat to re-focus its input surface
        // before the paste. A warm dictation otherwise pastes ~150ms after
        // the hotkey release, before Docs' hidden iframe is focused, and
        // the Cmd+V lands nowhere.
        if pasteFirst {
            sleep(config.browserPasteSettleMs / 1000.0)
        }
        let pasteResult = paster.paste(text: text, verifyAgainst: readableAndFieldSized ? focused : nil)
        if pasteResult.delivered {
            return .delivered(method: "pasted", verified: pasteResult.verified, note: pasteResult.note)
        }

        // #368: in a browser we usually can't read the field back, so a
        // paste we couldn't verify is the norm, not a failure. A single
        // Cmd+V into Docs works; typing it char by char mangles it. Trust
        // the paste rather than dropping to rung 3.
        if pasteFirst {
            return .delivered(method: "pasted", verified: false, note: "sent to the browser; can't read it back to confirm")
        }

        // The app rejected a paste we could actually verify. One atomic
        // paste into a field we could read is a bounded, undoable mistake;
        // typing blind into a field we never confirmed is not - see #62 -
        // so rung 3 only fires here, where we have positive evidence rung 2
        // failed, never for the fields we could not verify in the first
        // place.
        typer.type(text)
        let long = text.count > config.longTextChars
        return .delivered(
            method: "typed character by character",
            verified: false,
            note: long ? "\(text.count) characters typed blind - autocomplete or a vim mode can mangle it" : "nothing confirmed it arrived"
        )
    }
}
