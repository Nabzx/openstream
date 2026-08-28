public struct HotkeyFlags: OptionSet, Equatable {
    public let rawValue: UInt8

    public init(rawValue: UInt8) {
        self.rawValue = rawValue
    }

    public static let command = HotkeyFlags(rawValue: 1 << 0)
    public static let shift = HotkeyFlags(rawValue: 1 << 1)
    public static let alternate = HotkeyFlags(rawValue: 1 << 2)
    public static let control = HotkeyFlags(rawValue: 1 << 3)
    public static let secondaryFunction = HotkeyFlags(rawValue: 1 << 4)
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
    public static let standaloneCommandKeyCode: Int64 = 55
    public static let standaloneControlKeyCode: Int64 = 59
    public static let standaloneFnKeyCode: Int64 = 63
    public static let standaloneCapsLockKeyCode: Int64 = 57

    private static let rightCommandKeyCode: Int64 = 54
    private static let rightOptionKeyCode: Int64 = 61
    private static let rightControlKeyCode: Int64 = 62
    private static let functionKeyCodes: Set<Int64> = [
        122, 120, 99, 118, 96, 97, 98, 100, 101, 109,
        103, 111, 105, 107, 113, 106, 64, 79, 80
    ]

    private enum StandaloneTrigger {
        case modifier(flag: HotkeyFlags, keyCodes: Set<Int64>)
        case key(keyCode: Int64)
    }

    private let targetKeyCode: Int64
    private let targetFlags: HotkeyFlags
    private var isActive = false
    private var previousFlags: HotkeyFlags = []

    public init(keyCode: Int64, flags: HotkeyFlags) {
        self.targetKeyCode = keyCode
        self.targetFlags = flags
    }

    public mutating func handle(_ event: HotkeyEvent) -> HotkeySignal? {
        if let trigger = standaloneTrigger {
            switch trigger {
            case let .modifier(flag, keyCodes):
                return handleStandaloneModifier(event, flag: flag, keyCodes: keyCodes)
            case let .key(keyCode):
                return handleStandaloneKey(event, keyCode: keyCode)
            }
        }

        return handleLegacy(event)
    }

    private var standaloneTrigger: StandaloneTrigger? {
        guard targetFlags.isEmpty else { return nil }

        switch targetKeyCode {
        case Self.standaloneOptionKeyCode:
            return .modifier(flag: .alternate, keyCodes: [Self.standaloneOptionKeyCode, Self.rightOptionKeyCode])
        case Self.standaloneCommandKeyCode:
            return .modifier(flag: .command, keyCodes: [Self.standaloneCommandKeyCode, Self.rightCommandKeyCode])
        case Self.standaloneControlKeyCode:
            return .modifier(flag: .control, keyCodes: [Self.standaloneControlKeyCode, Self.rightControlKeyCode])
        case Self.standaloneFnKeyCode:
            return .modifier(flag: .secondaryFunction, keyCodes: [Self.standaloneFnKeyCode])
        case Self.standaloneCapsLockKeyCode:
            // The alpha-shift flag reports lock state, not a physical pair.
            // Only actual key events are usable as Push-to-talk edges.
            return .key(keyCode: Self.standaloneCapsLockKeyCode)
        default:
            return Self.functionKeyCodes.contains(targetKeyCode) ? .key(keyCode: targetKeyCode) : nil
        }
    }

    private mutating func handleLegacy(_ event: HotkeyEvent) -> HotkeySignal? {
        guard !targetFlags.isEmpty else { return nil }

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

    private mutating func handleStandaloneModifier(
        _ event: HotkeyEvent,
        flag: HotkeyFlags,
        keyCodes: Set<Int64>
    ) -> HotkeySignal? {
        guard event.type == .flagsChanged else { return nil }

        let wasDown = previousFlags.contains(flag)
        let isDown = event.flags.contains(flag)
        previousFlags = event.flags

        guard keyCodes.contains(event.keyCode) else { return nil }
        if !wasDown && isDown {
            guard event.flags.subtracting(flag).isEmpty, !isActive else { return nil }
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

    private mutating func handleStandaloneKey(_ event: HotkeyEvent, keyCode: Int64) -> HotkeySignal? {
        guard event.keyCode == keyCode else { return nil }

        switch event.type {
        case .keyDown:
            guard !event.isAutorepeat, !isActive, event.flags.isEmpty else { return nil }
            isActive = true
            return .down
        case .keyUp:
            guard isActive else { return nil }
            isActive = false
            return .up
        case .flagsChanged:
            return nil
        }
    }
}
