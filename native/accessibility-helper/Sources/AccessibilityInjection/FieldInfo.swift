public struct FieldInfo {
    public var role: String
    public var valueChars: Int?      // nil when the value attribute isn't readable
    public var selectedTextSettable: Bool

    public init(role: String, valueChars: Int?, selectedTextSettable: Bool) {
        self.role = role
        self.valueChars = valueChars
        self.selectedTextSettable = selectedTextSettable
    }
}
