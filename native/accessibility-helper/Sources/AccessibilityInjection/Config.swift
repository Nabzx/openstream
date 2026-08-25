import Foundation

// The thresholds #62 left as placeholders, pending real measurement in #74.
// stableForBlindPasteMs is deliberately 2x settleMs: settleMs asks "has the
// target stopped moving", stableForBlindPasteMs asks "have we watched it
// stand still long enough to believe the user is looking at it" - see #62.
public struct Config {
    public var settleMs: Double
    public var settleBudgetMs: Double
    public var axDeadlineMs: Double
    public var restoreMs: Double
    public var axValueMaxChars: Int
    public var longTextChars: Int
    public var stableForBlindPasteMs: Double?

    public init(
        settleMs: Double = 400,
        settleBudgetMs: Double = 1200,
        axDeadlineMs: Double = 150,
        restoreMs: Double = 300,
        axValueMaxChars: Int = 2000,
        longTextChars: Int = 120,
        stableForBlindPasteMs: Double? = 800
    ) {
        self.settleMs = settleMs
        self.settleBudgetMs = settleBudgetMs
        self.axDeadlineMs = axDeadlineMs
        self.restoreMs = restoreMs
        self.axValueMaxChars = axValueMaxChars
        self.longTextChars = longTextChars
        self.stableForBlindPasteMs = stableForBlindPasteMs
    }
}
