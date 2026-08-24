import ApplicationServices
import AppKit
import Foundation

func eprint(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

// The thresholds #62 left as placeholders, pending real measurement in #74.
// stableForBlindPasteMs is deliberately 2x settleMs: settleMs asks "has the
// target stopped moving", stableForBlindPasteMs asks "have we watched it
// stand still long enough to believe the user is looking at it" - see #62.
struct Config {
    var settleMs: Double = 400
    var settleBudgetMs: Double = 1200
    var axDeadlineMs: Double = 150
    var restoreMs: Double = 300
    var axValueMaxChars = 2000
    var longTextChars = 120
    var stableForBlindPasteMs: Double? = 800
}
let config = Config()

// Tracks when the frontmost app last changed, so delivery can be gated on it
// rather than trusting a possibly-stale pid - see #62's settle guard. Runs on
// its own thread with its own run loop: NSWorkspace notifications need a
// pumping run loop to arrive, and the main thread spends its time blocked in
// readLine() and in the AX calls below.
final class AppSwitchTracker {
    private let lock = NSLock()
    private var switchedAt = Date()
    // NSWorkspace.frontmostApplication is notification-driven internally and
    // goes stale on a thread that never pumps a run loop - which is exactly
    // what the main thread is, parked in readLine() and the AX calls below.
    // Caching the value here, updated only from the run-loop-pumping thread
    // below, is what keeps reads of it live instead of frozen at whatever
    // was frontmost the last time this thread got a turn.
    private var frontmost: NSRunningApplication?

    init() {
        frontmost = NSWorkspace.shared.frontmostApplication
    }

    func recordSwitch(to app: NSRunningApplication?) {
        lock.lock()
        switchedAt = Date()
        frontmost = app
        lock.unlock()
    }

    func ageMs(now: Date = Date()) -> Double {
        lock.lock()
        defer { lock.unlock() }
        return now.timeIntervalSince(switchedAt) * 1000
    }

    func currentFrontmost() -> NSRunningApplication? {
        lock.lock()
        defer { lock.unlock() }
        return frontmost
    }
}
let tracker = AppSwitchTracker()

Thread {
    NSWorkspace.shared.notificationCenter.addObserver(
        forName: NSWorkspace.didActivateApplicationNotification,
        object: nil,
        queue: nil
    ) { note in
        let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
        tracker.recordSwitch(to: app)
    }
    RunLoop.current.run()
}.start()

// stdout carries protocol only - every line here must be one JSON object.
func emit(_ dict: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: dict),
          let line = String(data: data, encoding: .utf8) else {
        eprint("accessibility-helper: failed to serialise a reply, dropping it")
        return
    }
    print(line)
    fflush(stdout)
}

// Accessibility, never Input Monitoring - the hotkey helper (#5) holds that
// separately, per the two-helper split settled in #26.
if !AXIsProcessTrusted() {
    eprint("accessibility-helper: Accessibility access not yet granted, requesting it now")
    let options: NSDictionary = [kAXTrustedCheckOptionPrompt.takeRetainedValue() as String: true]
    _ = AXIsProcessTrustedWithOptions(options)
}

emit(["event": "ready"])

// ---------------------------------------------------------------------------
// The fallback chain settled in #62: write at the caret, then clipboard +
// paste, then synthesised keystrokes - each rung's trigger is something this
// helper can actually detect, never assumed.
// ---------------------------------------------------------------------------

struct FieldInfo {
    var role: String
    var valueChars: Int?      // nil when the value attribute isn't readable
    var selectedTextSettable: Bool
}

func fieldInfo(_ element: AXUIElement) -> FieldInfo {
    var roleRef: CFTypeRef?
    AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
    let role = (roleRef as? String) ?? "unknown"

    var valueRef: CFTypeRef?
    let valueErr = AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
    let valueChars = (valueErr == .success) ? (valueRef as? String)?.count : nil

    var settable: DarwinBoolean = false
    AXUIElementIsAttributeSettable(element, kAXSelectedTextAttribute as CFString, &settable)

    return FieldInfo(role: role, valueChars: valueChars, selectedTextSettable: settable.boolValue)
}

// Rung 1: replace the current selection (a caret is a zero-length selection)
// with the transcript. Atomic, instant, no clipboard - this is the AX
// primitive for "insert at the cursor", distinct from kAXValueAttribute,
// which would overwrite the field's entire contents.
func writeAtCaret(_ element: AXUIElement, text: String) -> Bool {
    AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFTypeRef) == .success
}

func synthesizeCmdV() {
    let source = CGEventSource(stateID: .hidSystemState)
    let vKeyCode: CGKeyCode = 9 // 'V' on the ANSI layout
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: true)
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: false)
    keyDown?.flags = .maskCommand
    keyUp?.flags = .maskCommand
    keyDown?.post(tap: .cghidEventTap)
    keyUp?.post(tap: .cghidEventTap)
}

// Rung 2: borrow the clipboard, synthesise Cmd+V, then give it back. The
// restore is guarded against the race the #62 prototype flagged: if the
// user copies something else while our text is still sitting in the
// clipboard, changeCount will have moved past what we set, and we leave
// their copy alone rather than clobbering it.
//
// verifyAgainst, when non-nil, is a field we can read back from - readable
// and small enough not to be a terminal's scrollback (see #62's scrollback
// trigger). Reading it after the paste is the only real signal this helper
// has for "did the app actually accept the paste", so it is also the only
// case where a rejected paste falls through to rung 3 rather than being
// reported delivered-but-unverified.
func pasteViaClipboard(text: String, verifyAgainst: AXUIElement?, valueBefore: String?) -> (delivered: Bool, verified: Bool, note: String) {
    let pasteboard = NSPasteboard.general
    let saved = pasteboard.string(forType: .string)

    pasteboard.clearContents()
    pasteboard.setString(text, forType: .string)
    let ourChangeCount = pasteboard.changeCount

    synthesizeCmdV()
    Thread.sleep(forTimeInterval: config.restoreMs / 1000.0)

    if pasteboard.changeCount == ourChangeCount {
        pasteboard.clearContents()
        if let saved = saved { pasteboard.setString(saved, forType: .string) }
    } else {
        eprint("accessibility-helper: skipped the clipboard restore - the user copied something else while it was borrowed")
    }

    guard let element = verifyAgainst else {
        return (true, false, "sent, but nothing confirmed it landed")
    }

    var valueRef: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
    guard err == .success, let after = valueRef as? String, after.contains(text) else {
        return (false, false, "the app did not accept the paste")
    }
    _ = valueBefore
    return (true, true, "read back and confirmed")
}

// Rung 3: type it character by character. Works wherever a keyboard works,
// including surfaces with no usable AX tree, but it is slow and can drop or
// reorder characters on long text - see #62.
func typeCharacters(_ text: String) {
    let source = CGEventSource(stateID: .hidSystemState)
    for scalar in text.unicodeScalars {
        var chars = [UniChar(scalar.value)]
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: 0, keyDown: false)
        keyDown?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
        keyUp?.keyboardSetUnicodeString(stringLength: 1, unicodeString: &chars)
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
    }
}

func held(reason: String) -> [String: Any] {
    ["status": "held", "reason": reason]
}

func delivered(method: String, verified: Bool, note: String) -> [String: Any] {
    ["status": "delivered", "method": method, "verified": verified, "note": note]
}

// Chromium's own AX tree is normally built lazily, only once Chromium
// detects a running assistive technology by its own heuristics - which our
// direct AXUIElementCopyAttributeValue calls never trip. Setting this
// attribute forces the tree to build regardless. #28 found Electron apps
// (VS Code, Slack, Discord) exposing nothing but a bare AXWebArea without
// it. Unconditional and ignored on failure: on an app that doesn't
// recognise the attribute (i.e. anything not Chromium-based), the set just
// fails harmlessly - see #12.
func enableManualAccessibility(_ appElement: AXUIElement) {
    AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
}

// Resolves the focused element once per dictation. #12 folded this into the
// same helper #6 creates rather than a separate process or command,
// specifically so this resolution and inject() never race each other over
// focus - and so it only ever happens once: everything downstream (the
// fallback chain below) reuses this same element rather than re-asking.
func resolveFocusedElement(deadlineMs: Double) -> AXUIElement? {
    guard let frontApp = tracker.currentFrontmost() else { return nil }

    let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
    AXUIElementSetMessagingTimeout(appElement, Float(deadlineMs / 1000.0))
    enableManualAccessibility(appElement)

    var focusedRef: CFTypeRef?
    let focusErr = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedRef)
    guard focusErr == .success, let focusedRef = focusedRef else { return nil }

    return (focusedRef as! AXUIElement) // swiftlint:disable:this force_cast
}

// The decision procedure itself, ported from InjectionModel in
// prototypes/injection-62/index.html onto real AX/CGEvent calls.
func decideAndInject(text: String) -> [String: Any] {
    // Settle guard: never trust a target while the last app switch is more
    // recent than settleMs. Poll rather than trust a single reading, since
    // the tracker updates asynchronously on its own thread.
    let deadline = Date().addingTimeInterval(config.settleBudgetMs / 1000.0)
    while tracker.ageMs() < config.settleMs {
        if Date() >= deadline {
            return held(reason: "the front app kept changing, so we never trusted a target")
        }
        Thread.sleep(forTimeInterval: 0.02)
    }

    guard let focused = resolveFocusedElement(deadlineMs: config.axDeadlineMs) else {
        // Rung 0 didn't answer, or nothing is frontmost at all. The narrow
        // exception settled on #62: a known app that has sat still well
        // past the settle guard is a much smaller unknown than "which
        // app" - the user is demonstrably looking at it, so a blind paste
        // there is a bounded, undoable mistake rather than a shot in the
        // dark. We have no app name at all when nothing is frontmost, so
        // that case always falls through to hold below.
        if let gate = config.stableForBlindPasteMs, tracker.ageMs() >= gate,
           let appName = tracker.currentFrontmost()?.localizedName {
            let (_, _, note) = pasteViaClipboard(text: text, verifyAgainst: nil, valueBefore: nil)
            return delivered(method: "pasted into \(appName), field unknown", verified: false, note: note)
        }
        return held(reason: "the frontmost app never said what was focused, and hasn't been stable long enough to paste blind")
    }

    let info = fieldInfo(focused)
    let readableAndFieldSized = info.valueChars.map { $0 <= config.axValueMaxChars } ?? false

    // Rung 1: write straight into the field.
    if info.selectedTextSettable && readableAndFieldSized {
        if writeAtCaret(focused, text: text) {
            return delivered(method: "wrote into the field", verified: true, note: "inserted at the caret, clipboard untouched")
        }
        eprint("accessibility-helper: kAXSelectedTextAttribute reported settable but the write failed, falling back to paste")
    } else if info.selectedTextSettable, let chars = info.valueChars, chars > config.axValueMaxChars {
        eprint("accessibility-helper: refusing to write into \(info.role) - \(chars) characters of existing content looks like scrollback, not a field")
    }

    // Rung 2: clipboard + paste.
    let (pasteDelivered, verified, note) = pasteViaClipboard(
        text: text,
        verifyAgainst: readableAndFieldSized ? focused : nil,
        valueBefore: nil
    )
    if pasteDelivered {
        return delivered(method: "pasted", verified: verified, note: note)
    }

    // The app rejected a paste we could actually verify. One atomic paste
    // into a field we could read is a bounded, undoable mistake; typing
    // blind into a field we never confirmed is not - see #62 - so rung 3
    // only fires here, where we have positive evidence rung 2 failed, never
    // for the fields we could not verify in the first place.
    typeCharacters(text)
    let long = text.count > config.longTextChars
    return delivered(
        method: "typed character by character",
        verified: false,
        note: long ? "\(text.count) characters typed blind - autocomplete or a vim mode can mangle it" : "nothing confirmed it arrived"
    )
}

// Command loop: one newline-delimited JSON object per line on stdin, one
// reply per line on stdout, tagged with the same id so a slow request never
// head-of-line-blocks whatever the main process sent after it.
while let line = readLine(strippingNewline: true) {
    guard !line.isEmpty,
          let data = line.data(using: .utf8),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let id = obj["id"] as? String,
          let cmd = obj["cmd"] as? String else {
        eprint("accessibility-helper: ignoring malformed request: \(line)")
        continue
    }

    switch cmd {
    case "inject":
        guard let text = obj["text"] as? String, !text.isEmpty else {
            emit(["id": id, "status": "error", "reason": "inject requires non-empty \"text\""])
            continue
        }
        var reply = decideAndInject(text: text)
        reply["id"] = id
        emit(reply)
    default:
        emit(["id": id, "status": "error", "reason": "unknown command \"\(cmd)\""])
    }
}
