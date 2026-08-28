public struct HotkeyFlags: OptionSet, Equatable {
    public let rawValue: UInt8

    public init(rawValue: UInt8) {
        self.rawValue = rawValue
    }

    public static let command = HotkeyFlags(rawValue: 1 << 0)
    public static let shift = HotkeyFlags(rawValue: 1 << 1)
    public static let alternate = HotkeyFlags(rawValue: 1 << 2)
    public static let control = HotkeyFlags(rawValue: 1 << 3)
}

public enum HotkeyEventType {
    case keyDown
    case keyUp
    case flagsChanged
}

public struct HotkeyEvent {
    public let keyCode: Int64
    public let type: HotkeyEventType
    public let flags: HotkeyFlags
    public let isAutorepeat: Bool

    public init(keyCode: Int64, type: HotkeyEventType, flags: HotkeyFlags = [], isAutorepeat: Bool = false) {
        self.keyCode = keyCode
        self.type = type
        self.flags = flags
        self.isAutorepeat = isAutorepeat
    }
}

public enum HotkeySignal: Equatable {
    case down
    case up
}

public struct HotkeyMatcher {
    public static let standaloneOptionKeyCode: Int64 = 58
    private static let rightOptionKeyCode: Int64 = 61
    private static let functionKeyCodes: Set<Int64> = [
        122, 120, 99, 118, 96, 97, 98, 100, 101, 109,
        103, 111, 105, 107, 113, 106, 64, 79, 80
    ]

    private let targetKeyCode: Int64
    private let targetFlags: HotkeyFlags
    private var isActive = false
    private var previousFlags: HotkeyFlags = []

    public init(keyCode: Int64, flags: HotkeyFlags) {
        self.targetKeyCode = keyCode
        self.targetFlags = flags
    }

    public mutating func handle(_ event: HotkeyEvent) -> HotkeySignal? {
        if isStandaloneOption {
            return handleStandaloneOption(event)
        }
        guard !targetFlags.isEmpty || isFunctionKey else { return nil }

        switch event.type {
        case .keyDown:
            guard !event.isAutorepeat, !isActive else { return nil }
            guard event.keyCode == targetKeyCode, event.flags == targetFlags else { return nil }
            isActive = true
            return .down
        case .keyUp:
            guard isActive, event.keyCode == targetKeyCode else { return nil }
            isActive = false
            return .up
        case .flagsChanged:
            return nil
        }
    }

    private var isStandaloneOption: Bool {
        targetKeyCode == Self.standaloneOptionKeyCode && targetFlags.isEmpty
    }

    private var isFunctionKey: Bool {
        targetFlags.isEmpty && Self.functionKeyCodes.contains(targetKeyCode)
    }

    private static func isOptionKeyCode(_ keyCode: Int64) -> Bool {
        keyCode == Self.standaloneOptionKeyCode || keyCode == Self.rightOptionKeyCode
    }

    private mutating func handleStandaloneOption(_ event: HotkeyEvent) -> HotkeySignal? {
        guard event.type == .flagsChanged else { return nil }

        let wasDown = previousFlags.contains(.alternate)
        let isDown = event.flags.contains(.alternate)
        previousFlags = event.flags

        guard Self.isOptionKeyCode(event.keyCode) else { return nil }
        if !wasDown && isDown {
            guard event.flags.subtracting(.alternate).isEmpty, !isActive else { return nil }
            isActive = true
            return .down
        }
        if wasDown && !isDown {
            guard isActive else { return nil }
            isActive = false
            return .up
        }
        return nil
    }
}
