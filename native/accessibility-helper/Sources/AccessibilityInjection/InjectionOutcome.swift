// What decideAndInject reports back over the IPC protocol - see #6's
// contract (stdout carries protocol only). Typed here so tests can assert
// on it directly; main.swift converts it to the reply's JSON fields at the
// process boundary.
public enum InjectionOutcome: Equatable {
    case delivered(method: String, verified: Bool, note: String)
    case held(reason: String)

    public var replyFields: [String: Any] {
        switch self {
        case .delivered(let method, let verified, let note):
            return ["status": "delivered", "method": method, "verified": verified, "note": note]
        case .held(let reason):
            return ["status": "held", "reason": reason]
        }
    }
}
