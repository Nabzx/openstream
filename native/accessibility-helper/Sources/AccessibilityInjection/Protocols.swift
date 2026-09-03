// Everything InjectionEngine needs from the outside world, abstracted away
// from the real AX/CGEvent/NSPasteboard calls so the decision logic in
// InjectionEngine.swift can be driven by fakes in tests - the real
// implementations, in RealAdapters.swift, are the only place that talks to
// macOS directly.

public protocol AccessibilityTarget {
    var fieldInfo: FieldInfo { get }
    func writeAtCaret(_ text: String) -> Bool
    func readValue() -> String?
    // The user's current selection (#17, voice editing). Distinct from
    // readValue(), which returns the whole field. Optional with a nil
    // default so fakes that don't care about selection needn't implement it.
    func readSelectedText() -> String?
}

public extension AccessibilityTarget {
    func readSelectedText() -> String? { nil }
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
    // #368: bundle id of the frontmost app, for the paste-first list.
    // Defaulted so fakes that predate it keep compiling.
    func currentFrontmostBundleId() -> String?
}

public extension AppSwitchTracking {
    func currentFrontmostBundleId() -> String? { nil }
}
