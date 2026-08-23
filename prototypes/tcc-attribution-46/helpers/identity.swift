// PROTOTYPE - throwaway spike for issue #46. Not a native helper, not production.
//
// Shared identity block. Every helper prints this so the run records *which
// binary* was asking, next to what the OS answered. The three fields that
// matter to the question:
//
//   cdhash      - the code identity TCC would key an entry to, if entries are
//                 per-helper.
//   bundleId    - nil for a bare Mach-O. If it is nil, `tccutil reset` has no
//                 target for this binary, because tccutil takes a bundle id
//                 known to LaunchServices.
//   responsible - the pid macOS holds *responsible* for this process's TCC
//                 requests. If that is the Electron .app rather than the
//                 helper itself, the responsible-process mechanism is in play.
import Foundation
import Security

func selfSigningInfo() -> (cdhash: String, identifier: String, adhoc: Bool) {
    var code: SecCode?
    guard SecCodeCopySelf([], &code) == errSecSuccess, let code else {
        return ("<unavailable>", "<unavailable>", false)
    }
    var stat: SecStaticCode?
    guard SecCodeCopyStaticCode(code, [], &stat) == errSecSuccess, let stat else {
        return ("<unavailable>", "<unavailable>", false)
    }
    var infoRef: CFDictionary?
    let flags = SecCSFlags(rawValue: kSecCSSigningInformation)
    guard SecCodeCopySigningInformation(stat, flags, &infoRef) == errSecSuccess,
          let info = infoRef as? [String: Any] else {
        return ("<unavailable>", "<unavailable>", false)
    }
    let hash = (info[kSecCodeInfoUnique as String] as? Data)
        .map { $0.map { String(format: "%02x", $0) }.joined() } ?? "<unsigned>"
    let ident = info[kSecCodeInfoIdentifier as String] as? String ?? "<none>"
    // kSecCodeSignatureAdhoc == 0x0002 in the code-signing flags word.
    let cs = info[kSecCodeInfoFlags as String] as? UInt32 ?? 0
    return (hash, ident, cs & 0x0002 != 0)
}

// Private libsystem call behind the "responsible process" mechanism. Resolved
// at runtime because it has no public header.
func responsiblePid(for pid: pid_t) -> pid_t {
    typealias Fn = @convention(c) (pid_t) -> pid_t
    guard let sym = dlsym(UnsafeMutableRawPointer(bitPattern: -2), // RTLD_DEFAULT
                          "responsibility_get_pid_responsible_for_pid") else { return -1 }
    return unsafeBitCast(sym, to: Fn.self)(pid)
}

func processName(_ pid: pid_t) -> String {
    guard pid > 0 else { return "<none>" }
    var buf = [CChar](repeating: 0, count: 4096)
    guard proc_pidpath(pid, &buf, UInt32(buf.count)) > 0 else { return "<unknown>" }
    return String(cString: buf)
}

func identityFields(role: String) -> [String: Any] {
    let sign = selfSigningInfo()
    let me = getpid()
    let resp = responsiblePid(for: me)
    return [
        "role": role,
        "pid": Int(me),
        "executable": ProcessInfo.processInfo.arguments.first ?? "<none>",
        "resolvedExecutable": processName(me),
        "cdhash": sign.cdhash,
        "signingIdentifier": sign.identifier,
        "adhocSigned": sign.adhoc,
        "bundleIdentifier": Bundle.main.bundleIdentifier ?? NSNull(),
        "parentPid": Int(getppid()),
        "parentExecutable": processName(getppid()),
        "responsiblePid": Int(resp),
        "responsibleExecutable": processName(resp),
    ]
}

func emit(_ dict: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: dict, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
