import ApplicationServices
import AppKit
import Foundation

// The only file in this library that talks to macOS directly. Everything in
// InjectionEngine.swift goes through the protocols these types conform to.

public final class RealAXTarget: AccessibilityTarget {
    let element: AXUIElement

    public init(_ element: AXUIElement) {
        self.element = element
    }

    public var fieldInfo: FieldInfo {
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

    // Rung 1: replace the current selection (a caret is a zero-length
    // selection) with the transcript. Atomic, instant, no clipboard - this
    // is the AX primitive for "insert at the cursor", distinct from
    // kAXValueAttribute, which would overwrite the field's entire contents.
    public func writeAtCaret(_ text: String) -> Bool {
        AXUIElementSetAttributeValue(element, kAXSelectedTextAttribute as CFString, text as CFTypeRef) == .success
    }

    public func readValue() -> String? {
        var valueRef: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
        guard err == .success else { return nil }
        return valueRef as? String
    }

    public func readSelectedText() -> String? {
        var selectedRef: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(element, kAXSelectedTextAttribute as CFString, &selectedRef)
        guard err == .success else { return nil }
        return selectedRef as? String
    }
}

// Tracks when the frontmost app last changed, so delivery can be gated on it
// rather than trusting a possibly-stale pid - see #62's settle guard.
//
// #113 established that a direct read of NSWorkspace.shared.frontmostApplication
// from the IPC thread (parked in readLine()) returns a frozen value, so the
// live value is cached here and updated from startObserving()'s own thread.
//
// #173: that update used to be driven by NSWorkspace.didActivateApplication
// Notification. That notification is delivered on the MAIN thread's run loop,
// which this process never pumps (the main thread runs the readLine() command
// loop), so the observer never fired and the cache stayed frozen at init() -
// context detection then failed on every dictation, most visibly when the app
// was launched from an IDE-integrated terminal. Measured in
// prototypes/ax-notification-terminal-173: the notification mechanism itself
// works fine from every launch context; the bug was observing it on a run
// loop this process doesn't pump. So the frontmost app is now polled directly
// on startObserving()'s thread instead - a read that IS accurate from a
// thread that pumps its own run loop, which that one does.
public final class RealAppSwitchTracker: AppSwitchTracking {
    // The settle guard works at 400ms+ granularity (Config.settleMs), so
    // 250ms resolution on "when did the frontmost app last change" is ample.
    private static let pollInterval: TimeInterval = 0.25

    private let lock = NSLock()
    private var switchedAt = Date()
    private var frontmost: NSRunningApplication?

    public init() {
        frontmost = NSWorkspace.shared.frontmostApplication
    }

    // Must be called on a thread that then calls RunLoop.current.run() - the
    // poll timer is scheduled on that thread's run loop.
    public func startObserving() {
        let timer = Timer(timeInterval: Self.pollInterval, repeats: true) { [weak self] _ in
            self?.pollFrontmost()
        }
        RunLoop.current.add(timer, forMode: .common)
    }

    private func pollFrontmost() {
        let current = NSWorkspace.shared.frontmostApplication
        lock.lock()
        if current?.processIdentifier != frontmost?.processIdentifier {
            switchedAt = Date()
            frontmost = current
        }
        lock.unlock()
    }

    public func ageMs() -> Double {
        lock.lock()
        defer { lock.unlock() }
        return Date().timeIntervalSince(switchedAt) * 1000
    }

    public func currentFrontmostName() -> String? {
        currentFrontmostApp()?.localizedName
    }

    // Not part of AppSwitchTracking - RealFocusResolver needs the actual
    // NSRunningApplication (for its pid), not just its name.
    public func currentFrontmostApp() -> NSRunningApplication? {
        lock.lock()
        defer { lock.unlock() }
        return frontmost
    }
}

public final class RealFocusResolver: FocusResolving {
    private let tracker: RealAppSwitchTracker
    private let log: (String) -> Void

    public init(tracker: RealAppSwitchTracker, log: @escaping (String) -> Void = { _ in }) {
        self.tracker = tracker
        self.log = log
    }

    // The application that owns the focused UI element, read straight from
    // the system-wide AX element rather than the NSWorkspace tracker.
    //
    // #307: the tracker polls NSWorkspace.shared.frontmostApplication, which
    // lags - and, when OpenStream is launched from a terminal, can stay
    // frozen at the app that was frontmost at launch (the same class of
    // problem #113 and #173 hit). The fallout: context detection reported
    // "com.apple.Terminal" while the user dictated into Notes, the text
    // landed correctly (injection re-resolves the real focused element), but
    // a spoken "new paragraph" was dropped because Terminal isn't break-safe.
    //
    // kAXFocusedApplicationAttribute on the system-wide element is the AX
    // API's own answer to "who has focus", with no NSWorkspace round trip.
    // The tracker stays for the settle guard (#62), which is about timing
    // stability, not identity. Falls back to the tracker if the AX read
    // fails.
    private func frontmostApp(deadlineMs: Double) -> NSRunningApplication? {
        let systemWide = AXUIElementCreateSystemWide()
        AXUIElementSetMessagingTimeout(systemWide, Float(deadlineMs / 1000.0))

        var appRef: CFTypeRef?
        let err = AXUIElementCopyAttributeValue(systemWide, kAXFocusedApplicationAttribute as CFString, &appRef)
        if err == .success, let appRef {
            var pid: pid_t = 0
            if AXUIElementGetPid(appRef as! AXUIElement, &pid) == .success, // swiftlint:disable:this force_cast
               pid > 0,
               let app = NSRunningApplication(processIdentifier: pid) {
                return app
            }
        }

        let fallback = tracker.currentFrontmostApp()
        log("frontmostApp: system-wide focused application unavailable (AXError \(err.rawValue)), " +
            "falling back to the tracker (\(fallback?.bundleIdentifier ?? "none"))")
        return fallback
    }

    // Resolves the focused element once per dictation. #12 folded this into
    // the same helper #6 creates rather than a separate process or command,
    // specifically so this resolution and inject() never race each other
    // over focus - and so it only ever happens once: everything downstream
    // (InjectionEngine's fallback chain) reuses this same target rather
    // than re-asking.
    public func resolveFocusedElement(deadlineMs: Double) -> AccessibilityTarget? {
        guard let frontApp = frontmostApp(deadlineMs: deadlineMs) else {
            log("resolveFocusedElement: no frontmost app from AX or the tracker")
            return nil
        }

        let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
        AXUIElementSetMessagingTimeout(appElement, Float(deadlineMs / 1000.0))
        enableManualAccessibility(appElement)

        var focusedRef: CFTypeRef?
        let focusErr = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedRef)
        guard focusErr == .success, let focusedRef = focusedRef else {
            log("resolveFocusedElement: kAXFocusedUIElementAttribute failed for " +
                "\(frontApp.bundleIdentifier ?? "unknown bundle") (pid \(frontApp.processIdentifier)), " +
                "AXError \(focusErr.rawValue), trusted=\(AXIsProcessTrusted())")
            return nil
        }

        return RealAXTarget(focusedRef as! AXUIElement) // swiftlint:disable:this force_cast
    }

    // #181: retry resolveFocusedElement until it works or the budget runs
    // out. Each attempt is still capped by deadlineMs; a short sleep sits
    // between attempts. Used only by context/selection detection, not by
    // the injection path, so a slow AX tree can't add latency to delivery.
    private func resolveFocusedElementWithin(budgetMs: Double, deadlineMs: Double) -> AccessibilityTarget? {
        let start = Date()
        while true {
            if let target = resolveFocusedElement(deadlineMs: deadlineMs) {
                return target
            }
            if Date().timeIntervalSince(start) * 1000 >= budgetMs {
                return nil
            }
            Thread.sleep(forTimeInterval: 0.04)
        }
    }

    // axReady is false when the focused element never became resolvable
    // within the budget. The caller still gets a usable context - bundleId
    // from the tracker, isOneLineField defaulted to true (deny line breaks,
    // the safe direction for an unknown target) - rather than a hard nil
    // that would fail the whole dictation. See #181.
    public func focusContext(deadlineMs: Double, budgetMs: Double) -> (bundleId: String, isOneLineField: Bool, axReady: Bool)? {
        guard let frontApp = frontmostApp(deadlineMs: deadlineMs) else {
            log("focusContext: no frontmost app from AX or the tracker")
            return nil
        }
        guard let bundleId = frontApp.bundleIdentifier else {
            log("focusContext: frontmost app \(frontApp.localizedName ?? "?") (pid \(frontApp.processIdentifier)) has no bundle identifier")
            return nil
        }
        guard let focused = resolveFocusedElementWithin(budgetMs: budgetMs, deadlineMs: deadlineMs) else {
            log("focusContext: \(bundleId) focused element not AX-ready within \(budgetMs)ms - unknown-field context")
            return (bundleId, true, false)
        }

        let role = focused.fieldInfo.role
        return (bundleId, role == "AXTextField" || role == "AXComboBox", true)
    }

    // Voice editing (#17): the focused field's current selection, plus the
    // same bundle id / one-line-field context focusContext() returns.
    // nil means the focused element or the attribute could not be read;
    // an empty selectedText means there is simply nothing selected.
    public func selectionContext(deadlineMs: Double, budgetMs: Double) -> (bundleId: String, isOneLineField: Bool, selectedText: String)? {
        guard let frontApp = frontmostApp(deadlineMs: deadlineMs) else {
            log("selectionContext: no frontmost app from AX or the tracker")
            return nil
        }
        guard let bundleId = frontApp.bundleIdentifier else {
            log("selectionContext: frontmost app has no bundle identifier")
            return nil
        }
        // A voice edit needs the selection; if the AX tree isn't ready in
        // time there's nothing to read, so this returns nil and the caller
        // falls through to ordinary dictation (#17).
        guard let focused = resolveFocusedElementWithin(budgetMs: budgetMs, deadlineMs: deadlineMs) else {
            return nil
        }
        let role = focused.fieldInfo.role
        let isOneLineField = role == "AXTextField" || role == "AXComboBox"
        return (bundleId, isOneLineField, focused.readSelectedText() ?? "")
    }

    // Chromium's own AX tree is normally built lazily, only once Chromium
    // detects a running assistive technology by its own heuristics - which
    // a direct AXUIElementCopyAttributeValue call never trips. Setting this
    // attribute forces the tree to build regardless. #28 found Electron
    // apps (VS Code, Slack, Discord) exposing nothing but a bare AXWebArea
    // without it. Unconditional and ignored on failure: on an app that
    // doesn't recognise the attribute (i.e. anything not Chromium-based),
    // the set just fails harmlessly - see #12.
    private func enableManualAccessibility(_ appElement: AXUIElement) {
        AXUIElementSetAttributeValue(appElement, "AXManualAccessibility" as CFString, kCFBooleanTrue)
    }
}

public final class RealClipboardPaster: ClipboardPasting {
    private let restoreMs: Double
    private let log: (String) -> Void

    public init(restoreMs: Double, log: @escaping (String) -> Void = { _ in }) {
        self.restoreMs = restoreMs
        self.log = log
    }

    // Rung 2: borrow the clipboard, synthesise Cmd+V, then give it back.
    // The restore is guarded against the race the #62 prototype flagged: if
    // the user copies something else while our text is still sitting in
    // the clipboard, changeCount will have moved past what we set, and we
    // leave their copy alone rather than clobbering it.
    public func paste(text: String, verifyAgainst: AccessibilityTarget?) -> PasteResult {
        let pasteboard = NSPasteboard.general
        let saved = pasteboard.string(forType: .string)

        pasteboard.clearContents()
        pasteboard.setString(text, forType: .string)
        let ourChangeCount = pasteboard.changeCount

        synthesizeCmdV()
        Thread.sleep(forTimeInterval: restoreMs / 1000.0)

        if pasteboard.changeCount == ourChangeCount {
            pasteboard.clearContents()
            if let saved = saved { pasteboard.setString(saved, forType: .string) }
        } else {
            log("skipped the clipboard restore - the user copied something else while it was borrowed")
        }

        guard let target = verifyAgainst else {
            return PasteResult(delivered: true, verified: false, note: "sent, but nothing confirmed it landed")
        }

        guard let after = target.readValue(), after.contains(text) else {
            return PasteResult(delivered: false, verified: false, note: "the app did not accept the paste")
        }
        return PasteResult(delivered: true, verified: true, note: "read back and confirmed")
    }

    private func synthesizeCmdV() {
        let source = CGEventSource(stateID: .hidSystemState)
        let vKeyCode: CGKeyCode = 9 // 'V' on the ANSI layout
        let keyDown = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: true)
        let keyUp = CGEvent(keyboardEventSource: source, virtualKey: vKeyCode, keyDown: false)
        keyDown?.flags = .maskCommand
        keyUp?.flags = .maskCommand
        keyDown?.post(tap: .cghidEventTap)
        keyUp?.post(tap: .cghidEventTap)
    }
}

// Rung 3: type it character by character. Works wherever a keyboard works,
// including surfaces with no usable AX tree, but it is slow and can drop or
// reorder characters on long text - see #62.
public final class RealKeyTyper: KeyTyping {
    public init() {}

    public func type(_ text: String) {
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
}
