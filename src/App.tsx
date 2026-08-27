import HotkeySettings from "./HotkeySettings";
import BreakSafeAppsSettings from "./BreakSafeAppsSettings";
// VocabularySettings (#16) is deliberately not rendered - deprioritised to
// post-v1.0 (see the issue thread). The scanning/caching/pipeline wiring
// underneath it is built and tested and stays as-is; only the UI is hidden,
// so this is a one-line change to bring back once it's picked up again.
// import VocabularySettings from "./VocabularySettings";

export default function App() {
  return (
    <main className="shell">
      <h1>OpenStream Settings</h1>
      <HotkeySettings />
      <BreakSafeAppsSettings />
    </main>
  );
}
