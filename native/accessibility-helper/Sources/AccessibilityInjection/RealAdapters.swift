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
}

// Tracks when the frontmost app last changed, so delivery can be gated on it
// rather than trusting a possibly-stale pid - see #62's settle guard, and
// #113 for why NSWorkspace.shared.frontmostApplication can't be read
// directly here: it's notification-driven internally and goes stale on a
// thread that never pumps a run loop, which is exactly what the thread
// handling IPC is, parked in readLine() and the AX calls this file makes.
// Caching the value here, updated only from startObserving()'s thread,
// keeps reads of it live instead of frozen at whatever was frontmost the
// last time that thread got a turn.
public final class RealAppSwitchTracker: AppSwitchTracking {
    private let lock = NSLock()
    private var switchedAt = Date()
    private var frontmost: NSRunningApplication?

    public init() {
        frontmost = NSWorkspace.shared.frontmostApplication
    }

    // Must be called from the thread whose run loop will pump the
    // notification - see the note above. That thread should then call
    // RunLoop.current.run() to keep receiving them.
    public func startObserving() {
        NSWorkspace.shared.notificationCenter.addObserver(
            forName: NSWorkspace.didActivateApplicationNotification,
            object: nil,
            queue: nil
        ) { [weak self] note in
            let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication
            self?.recordSwitch(to: app)
        }
    }

    private func recordSwitch(to app: NSRunningApplication?) {
        lock.lock()
        switchedAt = Date()
        frontmost = app
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

    public init(tracker: RealAppSwitchTracker) {
        self.tracker = tracker
    }

    // Resolves the focused element once per dictation. #12 folded this into
    // the same helper #6 creates rather than a separate process or command,
    // specifically so this resolution and inject() never race each other
    // over focus - and so it only ever happens once: everything downstream
    // (InjectionEngine's fallback chain) reuses this same target rather
    // than re-asking.
    public func resolveFocusedElement(deadlineMs: Double) -> AccessibilityTarget? {
        guard let frontApp = tracker.currentFrontmostApp() else { return nil }

        let appElement = AXUIElementCreateApplication(frontApp.processIdentifier)
        AXUIElementSetMessagingTimeout(appElement, Float(deadlineMs / 1000.0))
        enableManualAccessibility(appElement)

        var focusedRef: CFTypeRef?
        let focusErr = AXUIElementCopyAttributeValue(appElement, kAXFocusedUIElementAttribute as CFString, &focusedRef)
        guard focusErr == .success, let focusedRef = focusedRef else { return nil }

        return RealAXTarget(focusedRef as! AXUIElement) // swiftlint:disable:this force_cast
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
