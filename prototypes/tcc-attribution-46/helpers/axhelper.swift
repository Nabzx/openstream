// PROTOTYPE - throwaway spike for issue #46.
//
// Stub for the planned *accessibility* helper. It does nothing the product
// needs; it only answers "does this binary hold Accessibility trust?" in two
// ways, because they can disagree:
//
//   reported   - AXIsProcessTrusted(), what the API claims.
//   functional - an actual AXUIElementCopyAttributeValue against the frontmost
//                app. A grant that reports true but returns kAXErrorAPIDisabled
//                is not a grant, and only the functional probe catches that.
//
// Flags: --prompt  ask for the grant (AXIsProcessTrustedWithOptions).
import Foundation
import ApplicationServices
import AppKit

func axErrorName(_ e: AXError) -> String {
    switch e {
    case .success: return "success"
    case .apiDisabled: return "kAXErrorAPIDisabled (not trusted)"
    case .noValue: return "kAXErrorNoValue (nothing focused)"
    case .cannotComplete: return "kAXErrorCannotComplete (app did not answer)"
    case .attributeUnsupported: return "kAXErrorAttributeUnsupported"
    case .invalidUIElement: return "kAXErrorInvalidUIElement"
    case .notImplemented: return "kAXErrorNotImplemented"
    default: return "AXError(\(e.rawValue))"
    }
}

// Bumped by rebuild-helpers.sh so the recompiled binary differs in content and
// therefore in CDHash. This constant is the whole point of the second rebuild.
let buildTag = "BUILD_TAG_PLACEHOLDER"

let args = Array(CommandLine.arguments.dropFirst())
let wantPrompt = args.contains("--prompt")

var out = identityFields(role: "axhelper")
out["buildTag"] = buildTag
out["grant"] = "Accessibility"

if wantPrompt {
    let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
    out["promptedTrusted"] = AXIsProcessTrustedWithOptions(opts)
}
out["reportedTrusted"] = AXIsProcessTrusted()

// Functional probe: read the focused element of whatever is frontmost.
if let front = NSWorkspace.shared.frontmostApplication {
    out["frontmostApp"] = front.bundleIdentifier ?? front.localizedName ?? "<unknown>"
    let app = AXUIElementCreateApplication(front.processIdentifier)
    var focused: CFTypeRef?
    let err = AXUIElementCopyAttributeValue(app, kAXFocusedUIElementAttribute as CFString, &focused)
    out["functionalAXError"] = Int(err.rawValue)
    out["functionalAXErrorName"] = axErrorName(err)
    out["functionallyTrusted"] = (err != .apiDisabled && err != .notImplemented)
} else {
    out["functionallyTrusted"] = false
    out["functionalAXErrorName"] = "noFrontmostApp"
}

emit(out)
