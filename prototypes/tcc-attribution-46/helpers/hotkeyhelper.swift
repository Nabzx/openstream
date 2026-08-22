// PROTOTYPE - throwaway spike for issue #46.
//
// Stub for the planned *hotkey* helper, the Input Monitoring half of the
// permission split. Same two-layer check as axhelper:
//
//   reported   - IOHIDCheckAccess(kIOHIDRequestTypeListenEvent).
//   functional - actually creating a listen-only CGEvent tap. Input Monitoring
//                is what a global hotkey listener really needs, and the tap
//                either gets created or it does not.
//
// Flags: --prompt  ask for the grant (IOHIDRequestAccess).
import Foundation
import IOKit.hid
import CoreGraphics

func accessName(_ t: IOHIDAccessType) -> String {
    switch t {
    case kIOHIDAccessTypeGranted: return "granted"
    case kIOHIDAccessTypeDenied: return "denied"
    case kIOHIDAccessTypeUnknown: return "unknown (never asked)"
    default: return "IOHIDAccessType(\(t.rawValue))"
    }
}

let buildTag = "BUILD_TAG_PLACEHOLDER"

let args = Array(CommandLine.arguments.dropFirst())
let wantPrompt = args.contains("--prompt")

var out = identityFields(role: "hotkeyhelper")
out["buildTag"] = buildTag
out["grant"] = "Input Monitoring"

if wantPrompt {
    out["promptedGranted"] = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
}

let access = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)
out["reportedAccess"] = accessName(access)
out["reportedGranted"] = (access == kIOHIDAccessTypeGranted)

// Functional probe: a listen-only tap on keyDown. Returns nil without the grant.
let mask = (1 << CGEventType.keyDown.rawValue)
let tap = CGEvent.tapCreate(tap: .cgSessionEventTap,
                            place: .headInsertEventTap,
                            options: .listenOnly,
                            eventsOfInterest: CGEventMask(mask),
                            callback: { _, _, event, _ in Unmanaged.passUnretained(event) },
                            userInfo: nil)
out["functionallyGranted"] = (tap != nil)
if let tap { CFMachPortInvalidate(tap) }

emit(out)
