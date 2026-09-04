public struct FieldInfo {
    public var role: String
    public var valueChars: Int?      // nil when the value attribute isn't readable
    public var selectedTextSettable: Bool
    // #368: bundle id of the app that owns the focused element, resolved
    // from its pid - more reliable than the frontmost-app tracker, which
    // lags when the helper is launched from a terminal.
    public var bundleId: String?

    public init(role: String, valueChars: Int?, selectedTextSettable: Bool, bundleId: String? = nil) {
        self.role = role
        self.valueChars = valueChars
        self.selectedTextSettable = selectedTextSettable
        self.bundleId = bundleId
    }
}
