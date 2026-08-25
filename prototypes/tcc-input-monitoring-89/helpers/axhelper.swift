// PROTOTYPE - throwaway spike for issue #89.
// Accessibility is a control arm: it checks whether an Accessibility request
// changes Input Monitoring state without any Input Monitoring call.
import Foundation
import ApplicationServices
import AppKit

func axErrorName(_ error: AXError) -> String {
    switch error {
    case .success: return "success"
    case .apiDisabled: return "kAXErrorAPIDisabled (not trusted)"
    case .noValue: return "kAXErrorNoValue (nothing focused)"
    case .cannotComplete: return "kAXErrorCannotComplete (app did not answer)"
    case .attributeUnsupported: return "kAXErrorAttributeUnsupported"
    case .invalidUIElement: return "kAXErrorInvalidUIElement"
    case .notImplemented: return "kAXErrorNotImplemented"
    default: return "AXError(\(error.rawValue))"
    }
}

let buildTag = "BUILD_TAG_PLACEHOLDER"
let wantsPrompt = Array(CommandLine.arguments.dropFirst()).contains("--prompt")

var output = identityFields(role: "axhelper")
output["buildTag"] = buildTag
output["grant"] = "Accessibility"
output["requestAttempted"] = wantsPrompt

if wantsPrompt {
    let options = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    output["requestResult"] = AXIsProcessTrustedWithOptions(options)
}
output["reportedTrusted"] = AXIsProcessTrusted()

if let frontmost = NSWorkspace.shared.frontmostApplication {
    output["frontmostApp"] = frontmost.bundleIdentifier ?? frontmost.localizedName ?? "<unknown>"
    let application = AXUIElementCreateApplication(frontmost.processIdentifier)
    var focused: CFTypeRef?
    let error = AXUIElementCopyAttributeValue(
        application,
        kAXFocusedUIElementAttribute as CFString,
        &focused
    )
    output["functionalAXError"] = Int(error.rawValue)
    output["functionalAXErrorName"] = axErrorName(error)
    output["functionallyTrusted"] = error != .apiDisabled && error != .notImplemented
} else {
    output["functionallyTrusted"] = false
    output["functionalAXErrorName"] = "noFrontmostApp"
}

emit(output)
