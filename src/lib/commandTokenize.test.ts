import { describe, it, expect } from "vitest";
import { tokenizeCommand } from "./commandTokenize";

describe("tokenizeCommand", () => {
  it("splits plain whitespace-separated words", () => {
    expect(tokenizeCommand("/app/vikunja/vikunja --help")).toEqual(["/app/vikunja/vikunja", "--help"]);
  });

  it("keeps a double-quoted argument as one token", () => {
    expect(tokenizeCommand('sh -c "echo foo bar"')).toEqual(["sh", "-c", "echo foo bar"]);
  });

  it("keeps a single-quoted argument as one token", () => {
    expect(tokenizeCommand("sh -c 'echo foo bar'")).toEqual(["sh", "-c", "echo foo bar"]);
  });

  it("collapses extra whitespace between tokens", () => {
    expect(tokenizeCommand("  --help   now  ")).toEqual(["--help", "now"]);
  });

  it("returns an empty array for blank input", () => {
    expect(tokenizeCommand("")).toEqual([]);
    expect(tokenizeCommand("   ")).toEqual([]);
  });
});
