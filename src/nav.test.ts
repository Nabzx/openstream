import { describe, expect, it } from "vitest";
import { coercePage, DEFAULT_PAGE, isPage, PAGES } from "./nav";

describe("isPage", () => {
  it("accepts the known pages", () => {
    for (const page of PAGES) expect(isPage(page)).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isPage("about")).toBe(false);
    expect(isPage("")).toBe(false);
    expect(isPage(null)).toBe(false);
    expect(isPage(2)).toBe(false);
  });
});

describe("coercePage", () => {
  it("passes a valid page through", () => {
    expect(coercePage("settings")).toBe("settings");
  });

  it("falls back to the default for an unknown value", () => {
    expect(coercePage("nope")).toBe(DEFAULT_PAGE);
  });

  it("falls back to the given page rather than the default when asked", () => {
    expect(coercePage(undefined, "settings")).toBe("settings");
  });
});
