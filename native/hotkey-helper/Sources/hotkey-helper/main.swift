import CoreGraphics
import Foundation

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
}

func parseModifiers(_ raw: String) -> CGEventFlags {
    var flags: CGEventFlags = []
    for name in raw.split(separator: ",") {
        switch name.trimmingCharacters(in: .whitespaces) {
        case "cmd": flags.insert(.maskCommand)
        case "shift": flags.insert(.maskShift)
        case "alt", "option": flags.insert(.maskAlternate)
        case "ctrl", "control": flags.insert(.maskControl)
        default: eprint("hotkey-helper: ignoring unknown modifier \"\(name)\"")
        }
    }
    return flags
}

func parseArgs() -> (keyCode: Int64, flags: CGEventFlags) {
    var keyCode: Int64 = 2 // 'D' on the ANSI layout - matches CommandOrControl+Shift+D
    var flags: CGEventFlags = [.maskCommand, .maskShift]

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

let (targetKeyCode, targetFlags) = parseArgs()
let relevantFlagsMask: CGEventFlags = [.maskCommand, .maskShift, .maskAlternate, .maskControl]

var tap: CFMachPort?

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

    guard type == .keyDown || type == .keyUp else {
        return Unmanaged.passRetained(event)
    }

    // Key repeat resends keyDown for as long as the key is held - only the
    // first down and the eventual up are a press/release pair.
    if type == .keyDown && event.getIntegerValueField(.keyboardEventAutorepeat) != 0 {
        return Unmanaged.passRetained(event)
    }

    let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
    let flags = event.flags.intersection(relevantFlagsMask)
    if keyCode == targetKeyCode && flags == targetFlags {
        emit(type == .keyDown ? "down" : "up")
    }

    return Unmanaged.passRetained(event)
}

if !CGPreflightListenEventAccess() {
    eprint("hotkey-helper: Input Monitoring access not yet granted, requesting it now")
    _ = CGRequestListenEventAccess()
}

let eventMask: CGEventMask = (1 << CGEventType.keyDown.rawValue) | (1 << CGEventType.keyUp.rawValue)

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

emit("ready")
CFRunLoopRun()
