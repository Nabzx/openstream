import { useEffect, useState } from "react";
import { coercePage, type Page } from "./nav";
import { HomeIcon, SettingsIcon } from "./components/Icons";
import Home from "./pages/Home";
import Settings from "./pages/Settings";

const TABS: { page: Page; label: string; Icon: (props: { className?: string }) => JSX.Element }[] = [
  { page: "home", label: "Home", Icon: HomeIcon },
  { page: "settings", label: "Settings", Icon: SettingsIcon },
];

export default function App() {
  const [page, setPage] = useState<Page>("home");

  // The App menu's "Settings…" item and the tray ask the shell to switch
  // pages over IPC (see electron/preload.js). onNavigate returns its own
  // unsubscribe.
  useEffect(() => window.openstream.onNavigate((next) => setPage((current) => coercePage(next, current))), []);

  return (
    <div className="shell">
      <nav className="toolbar">
        {TABS.map(({ page: tabPage, label, Icon }) => (
          <button
            key={tabPage}
            type="button"
            className="navtab"
            aria-current={page === tabPage ? "page" : undefined}
            onClick={() => setPage(tabPage)}
          >
            <Icon />
            {label}
          </button>
        ))}
      </nav>
      {page === "home" ? <Home onOpenSettings={() => setPage("settings")} /> : <Settings />}
    </div>
  );
}
