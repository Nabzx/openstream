import { describe, expect, it } from "vitest";
import { cleanupDictation } from "./cleanup";

describe("cleanupDictation", () => {
  it("removes fillers, collapses repeats including contractions, and applies static vocabulary fixes", () => {
    const result = cleanupDictation("um i i can't can't use github with type script", {
      breakSafe: true,
      oneLine: false,
    });

    expect(result.text).toBe("I can't use GitHub with TypeScript.");
  });

  it("converts spoken punctuation and preserves explicit breaks only in break-safe multi-line contexts", () => {
    const safe = cleanupDictation("hello comma world new paragraph next line", {
      breakSafe: true,
      oneLine: false,
    });
    expect(safe.text).toBe("Hello, world\n\nNext line.");
    expect(safe.hasExplicitBreakCommand).toBe(true);

    const unsafe = cleanupDictation("hello new paragraph world", { breakSafe: false, oneLine: false });
    expect(unsafe.text).toBe("Hello world.");
  });

  it("removes transcription server hard wraps", () => {
    const result = cleanupDictation("this is a long line\nwrapped by the server\nnot by the speaker", {
      breakSafe: true,
      oneLine: false,
    });

    expect(result.text).toBe("This is a long line wrapped by the server not by the speaker.");
  });

  it("does not add a final full stop in one-line fields", () => {
    const result = cleanupDictation("search for javascript period", { breakSafe: true, oneLine: true });

    expect(result.text).toBe("Search for JavaScript");
  });
});
