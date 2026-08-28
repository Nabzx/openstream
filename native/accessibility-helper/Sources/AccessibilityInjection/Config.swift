import Foundation

// The thresholds #62 left as placeholders, pending real measurement in #74.
// stableForBlindPasteMs is deliberately 2x settleMs: settleMs asks "has the
// target stopped moving", stableForBlindPasteMs asks "have we watched it
// stand still long enough to believe the user is looking at it" - see #62.
public struct Config {
    public var settleMs: Double
    public var settleBudgetMs: Double
    public var axDeadlineMs: Double
    // #181: how long context detection retries a not-yet-ready AX tree
    // before giving up and returning an unknown-field context. A cold
    // Chrome tab can take 5+ seconds to become AX-ready (measured in
    // prototypes/electron-ax-tree-10) - we can't win that race inside the
    // sub-1s dictation budget, so this is deliberately short: catch a
    // target that's a beat slow, fall back for one that's genuinely cold.
    public var axReadyBudgetMs: Double
    // #227: the same idea on the injection path. decide() used to resolve
    // the focused element once and, on a miss, drop to blind-paste-or-hold
    // - so an Electron target whose AX tree wasn't up on the first read
    // (VS Code, Slack; the #28 case) lost the dictation even though the
    // tree came good a beat later. Shorter than axReadyBudgetMs because
    // this sits on the release-to-cursor latency the product commits to.
    public var axInjectBudgetMs: Double
    public var restoreMs: Double
    public var axValueMaxChars: Int
    public var longTextChars: Int
    public var stableForBlindPasteMs: Double?

    public init(
        settleMs: Double = 400,
        settleBudgetMs: Double = 1200,
        axDeadlineMs: Double = 150,
        axReadyBudgetMs: Double = 250,
        axInjectBudgetMs: Double = 200,
        restoreMs: Double = 300,
        axValueMaxChars: Int = 2000,
        longTextChars: Int = 120,
        stableForBlindPasteMs: Double? = 800
    ) {
        self.settleMs = settleMs
        self.settleBudgetMs = settleBudgetMs
        self.axDeadlineMs = axDeadlineMs
        self.axReadyBudgetMs = axReadyBudgetMs
        self.axInjectBudgetMs = axInjectBudgetMs
        self.restoreMs = restoreMs
        self.axValueMaxChars = axValueMaxChars
        self.longTextChars = longTextChars
        self.stableForBlindPasteMs = stableForBlindPasteMs
    }
}
