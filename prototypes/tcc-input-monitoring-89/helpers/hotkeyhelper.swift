// PROTOTYPE - throwaway spike for issue #89.
//
// Each operation isolates one possible Input Monitoring registration trigger:
//   check             read state only
//   request-only      IOHIDRequestAccess, no event tap
//   tap-only          real listen-only CGEvent tap, no request call
//   request-and-tap   both calls, matching the production helper's sequence
import Foundation
import IOKit.hid
import CoreGraphics

func accessName(_ access: IOHIDAccessType) -> String {
    switch access {
    case kIOHIDAccessTypeGranted: return "granted"
    case kIOHIDAccessTypeDenied: return "denied"
    case kIOHIDAccessTypeUnknown: return "unknown (never asked)"
    default: return "IOHIDAccessType(\(access.rawValue))"
    }
}

let buildTag = "BUILD_TAG_PLACEHOLDER"
let operation = Array(CommandLine.arguments.dropFirst()).first ?? "check"
let requestsAccess = operation == "request-only" || operation == "request-and-tap"
let attemptsTap = operation == "tap-only" || operation == "request-and-tap"

var output = identityFields(role: "hotkeyhelper")
output["buildTag"] = buildTag
output["grant"] = "Input Monitoring"
output["operation"] = operation
output["requestAttempted"] = requestsAccess
output["tapAttempted"] = attemptsTap

if requestsAccess {
    output["requestResult"] = IOHIDRequestAccess(kIOHIDRequestTypeListenEvent)
}

let access = IOHIDCheckAccess(kIOHIDRequestTypeListenEvent)
output["reportedAccess"] = accessName(access)
output["reportedGranted"] = access == kIOHIDAccessTypeGranted

if attemptsTap {
    let mask = CGEventMask(1 << CGEventType.keyDown.rawValue)
    let tap = CGEvent.tapCreate(
        tap: .cgSessionEventTap,
        place: .headInsertEventTap,
        options: .listenOnly,
        eventsOfInterest: mask,
        callback: { _, _, event, _ in Unmanaged.passUnretained(event) },
        userInfo: nil
    )
    output["tapCreated"] = tap != nil
    output["functionallyGranted"] = tap != nil
    if let tap { CFMachPortInvalidate(tap) }
} else {
    output["tapCreated"] = false
    output["functionallyGranted"] = access == kIOHIDAccessTypeGranted
}

emit(output)
