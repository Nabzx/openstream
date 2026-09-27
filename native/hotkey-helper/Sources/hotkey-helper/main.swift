import CoreGraphics
import Foundation
import HotkeyMatcher

// Push-to-talk hotkey helper, per issue #5.
//
// Permission: Input Monitoring only, never Accessibility - held separately
// by the accessibility helper (#6), so a stalled AX call can never starve
// this tap (#26).
//
// Protocol: stdio, newline-delimited JSON, one-way (helper -> main),
// fire-and-forget. stdout carries protocol only; everything else goes to
// stderr. The Electron main process decides what a press means - this
// helper only reports key-down and key-up for the one configured hotkey.

func eprint(_ message: String) {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
}

func emit(_ event: String) {
    // No user text ever crosses this channel, so no escaping is needed here.
    print("{\"event\":\"\(event)\",\"ts\":\(Date().timeIntervalSince1970)}")
    // stdout is fully buffered, not line-buffered, once it's a pipe rather than
    // a tty - which is exactly what Electron's spawn() gives it. Without this,
    // "ready"/"down"/"up" sit in the buffer indefinitely instead of reaching
    // the parent process, so the hotkey silently does nothing.
    fflush(stdout)
}

func parseModifiers(_ raw: String) -> HotkeyFlags {
    var flags: HotkeyFlags = []
    for name in raw.split(separator: ",") {
        switch name.trimmingCharacters(in: .whitespaces) {
        case "cmd": flags.insert(.command)
        case "shift": flags.insert(.shift)
        case "alt", "option": flags.insert(.alternate)
        case "ctrl", "control": flags.insert(.control)
        default: eprint("hotkey-helper: ignoring unknown modifier \"\(name)\"")
        }
    }
    return flags
}

func parseArgs() -> (keyCode: Int64, flags: HotkeyFlags) {
    var keyCode = HotkeyMatcher.standaloneOptionKeyCode
    var flags: HotkeyFlags = []

    let args = CommandLine.arguments
    var i = 1
    while i < args.count {
        switch args[i] {
        case "--keycode":
            i += 1
            if i < args.count, let parsed = Int64(args[i]) { keyCode = parsed }
        case "--modifiers":
            i += 1
            if i < args.count { flags = parseModifiers(args[i]) }
        default:
            eprint("hotkey-helper: ignoring unknown argument \"\(args[i])\"")
        }
        i += 1
    }
    return (keyCode, flags)
}

let configuration = parseArgs()
var matcher = HotkeyMatcher(keyCode: configuration.keyCode, flags: configuration.flags)

var tap: CFMachPort?

func hotkeyFlags(for flags: CGEventFlags) -> HotkeyFlags {
    var result: HotkeyFlags = []
    if flags.contains(.maskCommand) { result.insert(.command) }
    if flags.contains(.maskShift) { result.insert(.shift) }
    if flags.contains(.maskAlternate) { result.insert(.alternate) }
    if flags.contains(.maskControl) { result.insert(.control) }
    if flags.contains(.maskSecondaryFn) { result.insert(.secondaryFunction) }
    return result
}

func handleEvent(proxy: CGEventTapProxy, type: CGEventType, event: CGEvent, refcon: UnsafeMutableRawPointer?) -> Unmanaged<CGEvent>? {
    if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
        // macOS kills a tap that doesn't respond in time and leaves it dead
        // until re-enabled - the helper's one piece of native housekeeping.
        if let tap = tap {
            CGEvent.tapEnable(tap: tap, enable: true)
            eprint("hotkey-helper: tap was disabled (\(type)), re-enabled")
        }
        return Unmanaged.passRetained(event)
    }

    guard type == .keyDown || type == .keyUp || type == .flagsChanged else {
        return Unmanaged.passRetained(event)
    }

    let eventType: HotkeyEventType
    switch type {
    case .keyDown: eventType = .keyDown
    case .keyUp: eventType = .keyUp
    case .flagsChanged: eventType = .flagsChanged
    default: return Unmanaged.passRetained(event)
    }

    let hotkeyEvent = HotkeyEvent(
        keyCode: event.getIntegerValueField(.keyboardEventKeycode),
        type: eventType,
        flags: hotkeyFlags(for: event.flags),
        isAutorepeat: event.getIntegerValueField(.keyboardEventAutorepeat) != 0
    )
    if let signal = matcher.handle(hotkeyEvent) {
        emit(signal == .down ? "down" : "up")
    }

    return Unmanaged.passRetained(event)
}

if !CGPreflightListenEventAccess() {
    eprint("hotkey-helper: Input Monitoring access not yet granted, requesting it now")
    _ = CGRequestListenEventAccess()
}

let eventMask: CGEventMask =
    (1 << CGEventType.keyDown.rawValue) |
    (1 << CGEventType.keyUp.rawValue) |
    (1 << CGEventType.flagsChanged.rawValue)

guard let createdTap = CGEvent.tapCreate(
    tap: .cgSessionEventTap,
    place: .headInsertEventTap,
    options: .listenOnly,
    eventsOfInterest: eventMask,
    callback: handleEvent,
    userInfo: nil
) else {
    eprint("hotkey-helper: failed to create event tap - Input Monitoring permission is likely missing")
    exit(1)
}

tap = createdTap
let runLoopSource = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, createdTap, 0)
CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, .commonModes)
CGEvent.tapEnable(tap: createdTap, enable: true)

// #443: accessibility-helper and transcription-helper both sit in a
// readLine() command loop, so a SIGKILL'd parent closes their stdin pipe
// and they exit on their own - no signal needed. This helper never reads
// stdin at all (CFRunLoopRun() below never returns on its own), so a hard
// kill of the Electron parent (Force Quit, `kill -9`, a native crash) used
// to leave it running forever, still holding the Input Monitoring tap -
// and a relaunch would then race a second tap against it on every
// keystroke. Reparenting is the portable signal an orphan gets: once the
// original parent is gone, getppid() changes (typically to launchd), so
// polling it is enough to notice without needing a pipe of our own.
let originalParentPid = getppid()
let watchdog = Timer(timeInterval: 2.0, repeats: true) { _ in
    if getppid() != originalParentPid {
        eprint("hotkey-helper: parent process \(originalParentPid) is gone - exiting rather than holding the tap orphaned")
        exit(0)
    }
}
CFRunLoopAddTimer(CFRunLoopGetCurrent(), watchdog, .commonModes)

emit("ready")
CFRunLoopRun()
