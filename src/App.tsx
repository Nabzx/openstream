import HotkeySettings from "./HotkeySettings";
import BreakSafeAppsSettings from "./BreakSafeAppsSettings";
import VocabularySettings from "./VocabularySettings";

export default function App() {
  return (
    <main className="shell">
      <h1>OpenStream Settings</h1>
      <HotkeySettings />
      <BreakSafeAppsSettings />
      <VocabularySettings />
    </main>
  );
}
