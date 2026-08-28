import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HotkeySettings from "./HotkeySettings";

describe("HotkeySettings", () => {
  it("explains function-key availability without promising every key works", () => {
    const markup = renderToStaticMarkup(<HotkeySettings />);

    expect(markup).toContain("F1–F12 require the top row to be in function-key mode.");
    expect(markup).toContain("F13–F19 depend on keyboard support.");
    expect(markup).toContain("cannot reliably detect whether macOS or another app also uses a key.");
  });
});
