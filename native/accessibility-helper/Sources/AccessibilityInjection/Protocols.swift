// Everything InjectionEngine needs from the outside world, abstracted away
// from the real AX/CGEvent/NSPasteboard calls so the decision logic in
// InjectionEngine.swift can be driven by fakes in tests - the real
// implementations, in RealAdapters.swift, are the only place that talks to
// macOS directly.

public protocol AccessibilityTarget {
    var fieldInfo: FieldInfo { get }
    func writeAtCaret(_ text: String) -> Bool
    func readValue() -> String?
}

public protocol FocusResolving {
    func resolveFocusedElement(deadlineMs: Double) -> AccessibilityTarget?
}

public struct PasteResult {
    public var delivered: Bool
    public var verified: Bool
    public var note: String

    public init(delivered: Bool, verified: Bool, note: String) {
        self.delivered = delivered
        self.verified = verified
        self.note = note
    }
}

public protocol ClipboardPasting {
    // verifyAgainst, when non-nil, is a field the caller can read back from
    // afterwards - readable and small enough not to be a terminal's
    // scrollback (see #62's scrollback trigger). This is the only real
    // signal an implementation has for "did the app actually accept the
    // paste".
    func paste(text: String, verifyAgainst: AccessibilityTarget?) -> PasteResult
}

public protocol KeyTyping {
    func type(_ text: String)
}

public protocol AppSwitchTracking {
    func ageMs() -> Double
    func currentFrontmostName() -> String?
}
