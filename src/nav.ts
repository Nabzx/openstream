// The window's two pages (issue #210). Kept as its own module so the
// shell and its test share one source of truth, and so a `navigate`
// message from the main process can be validated before it's trusted.

// "permissions" and "setup" are reachable views but not toolbar tabs - the
// app navigates to them when a grant is missing / a model is downloading.
export type Page = "home" | "commands" | "settings" | "permissions" | "setup";

export const PAGES = ["home", "commands", "settings", "permissions", "setup"] as const;

export const TAB_PAGES = ["home", "commands", "settings"] as const;
export type TabPage = (typeof TAB_PAGES)[number];

export const DEFAULT_PAGE: Page = "home";

export function isPage(value: unknown): value is Page {
  return typeof value === "string" && (PAGES as readonly string[]).includes(value);
}

// A navigate request from main (the App menu, the tray) - fall back to
// the current page rather than throwing if it's ever something unexpected.
export function coercePage(value: unknown, fallback: Page = DEFAULT_PAGE): Page {
  return isPage(value) ? value : fallback;
}
