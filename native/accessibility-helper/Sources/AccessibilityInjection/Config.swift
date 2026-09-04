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
    // #368: apps whose focused element accepts a kAXSelectedTextAttribute
    // write and silently drops it (Google Docs renders to a canvas and
    // manages input itself; other browser editors do the same). In these
    // we skip rung 1 entirely and paste, and we trust an unverifiable
    // paste rather than falling to blind char-by-char typing.
    public var pasteFirstBundleIds: Set<String>
    // #368: Google Docs re-focuses its hidden editing iframe a beat after
    // key focus returns to the browser. A paste fired inside that beat -
    // which a warm dictation does, ~150ms after the hotkey release - lands
    // nowhere. Wait this long before pasting into a pasteFirst app. The
    // first, cold dictation already clears it via the AX warm-up.
    public var browserPasteSettleMs: Double

    public init(
        settleMs: Double = 400,
        settleBudgetMs: Double = 1200,
        axDeadlineMs: Double = 150,
        axReadyBudgetMs: Double = 250,
        axInjectBudgetMs: Double = 200,
        restoreMs: Double = 300,
        axValueMaxChars: Int = 2000,
        longTextChars: Int = 120,
        stableForBlindPasteMs: Double? = 800,
        pasteFirstBundleIds: Set<String> = [
            "com.google.Chrome",
            "com.google.Chrome.canary",
            "com.google.Chrome.beta",
            "com.google.Chrome.dev",
            "com.apple.Safari",
            "com.apple.SafariTechnologyPreview",
            "company.thebrowser.Browser",
            "com.microsoft.edgemac",
            "com.brave.Browser",
            "org.mozilla.firefox",
            "com.vivaldi.Vivaldi",
            "com.operasoftware.Opera",
        ],
        browserPasteSettleMs: Double = 400
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
        self.pasteFirstBundleIds = pasteFirstBundleIds
        self.browserPasteSettleMs = browserPasteSettleMs
    }
}
