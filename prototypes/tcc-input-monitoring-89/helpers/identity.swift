// PROTOTYPE - throwaway spike for issue #89. Not production.
//
// The helper prints its code identity and responsible process beside the
// permission result. This keeps the attribution experiment auditable without
// reading the SIP-protected TCC databases.
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
    let signingFlags = SecCSFlags(rawValue: kSecCSSigningInformation)
    guard SecCodeCopySigningInformation(stat, signingFlags, &infoRef) == errSecSuccess,
          let info = infoRef as? [String: Any] else {
        return ("<unavailable>", "<unavailable>", false)
    }
    let hash = (info[kSecCodeInfoUnique as String] as? Data)
        .map { $0.map { String(format: "%02x", $0) }.joined() } ?? "<unsigned>"
    let ident = info[kSecCodeInfoIdentifier as String] as? String ?? "<none>"
    let codeFlags = info[kSecCodeInfoFlags as String] as? UInt32 ?? 0
    return (hash, ident, codeFlags & 0x0002 != 0)
}

func responsiblePid(for pid: pid_t) -> pid_t {
    typealias Function = @convention(c) (pid_t) -> pid_t
    guard let symbol = dlsym(UnsafeMutableRawPointer(bitPattern: -2),
                             "responsibility_get_pid_responsible_for_pid") else { return -1 }
    return unsafeBitCast(symbol, to: Function.self)(pid)
}

func processName(_ pid: pid_t) -> String {
    guard pid > 0 else { return "<none>" }
    var buffer = [CChar](repeating: 0, count: 4096)
    guard proc_pidpath(pid, &buffer, UInt32(buffer.count)) > 0 else { return "<unknown>" }
    return String(cString: buffer)
}

func identityFields(role: String) -> [String: Any] {
    let signing = selfSigningInfo()
    let pid = getpid()
    let responsible = responsiblePid(for: pid)
    return [
        "role": role,
        "pid": Int(pid),
        "executable": ProcessInfo.processInfo.arguments.first ?? "<none>",
        "resolvedExecutable": processName(pid),
        "cdhash": signing.cdhash,
        "signingIdentifier": signing.identifier,
        "adhocSigned": signing.adhoc,
        "bundleIdentifier": Bundle.main.bundleIdentifier ?? NSNull(),
        "parentPid": Int(getppid()),
        "parentExecutable": processName(getppid()),
        "responsiblePid": Int(responsible),
        "responsibleExecutable": processName(responsible),
    ]
}

func emit(_ dictionary: [String: Any]) {
    let data = try! JSONSerialization.data(withJSONObject: dictionary, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write("\n".data(using: .utf8)!)
}
