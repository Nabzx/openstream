import { useEffect, useState } from "react";
import { coercePage, TAB_PAGES, type Page, type TabPage } from "./nav";
import { CommandsIcon, HomeIcon, SettingsIcon } from "./components/Icons";
import Home from "./pages/Home";
import Commands from "./pages/Commands";
import Settings from "./pages/Settings";
import Permissions from "./pages/Permissions";
import Setup from "./pages/Setup";

const TAB_META: Record<TabPage, { label: string; Icon: (props: { className?: string }) => JSX.Element }> = {
  home: { label: "Home", Icon: HomeIcon },
  commands: { label: "Commands", Icon: CommandsIcon },
  settings: { label: "Settings", Icon: SettingsIcon },
};

export default function App() {
  const [page, setPage] = useState<Page>("home");

  // The App menu's "Settings…" item and the tray ask the shell to switch
  // pages over IPC (see electron/preload.js). onNavigate returns its own
  // unsubscribe.
  useEffect(() => window.openstream.onNavigate((next) => setPage((current) => coercePage(next, current))), []);

  return (
    <div className="shell">
      <nav className="toolbar">
        {TAB_PAGES.map((tabPage) => {
          const { label, Icon } = TAB_META[tabPage];
          return (
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
          );
        })}
      </nav>
      {page === "settings" && <Settings />}
      {page === "commands" && <Commands />}
      {page === "setup" && <Setup onDone={() => setPage("home")} />}
      {page === "permissions" && <Permissions onDone={() => setPage("home")} />}
      {page === "home" && <Home navigate={(next) => setPage(next)} />}
    </div>
  );
}
