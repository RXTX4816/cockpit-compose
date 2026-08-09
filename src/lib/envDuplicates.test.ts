import { describe, it, expect } from "vitest";
import { hasDuplicateEnvKeys } from "./envDuplicates";

describe("hasDuplicateEnvKeys", () => {
  it("returns false for unique keys", () => {
    expect(hasDuplicateEnvKeys("FOO=a\nBAR=b\n")).toBe(false);
  });

  it("returns true for a repeated key", () => {
    expect(hasDuplicateEnvKeys("FOO=a\nFOO=b\n")).toBe(true);
  });

  it("ignores comment lines", () => {
    expect(hasDuplicateEnvKeys("# FOO=a\nFOO=b\n")).toBe(false);
  });

  it("ignores blank lines", () => {
    expect(hasDuplicateEnvKeys("FOO=a\n\nBAR=b\n")).toBe(false);
  });

  it("ignores lines without an =", () => {
    expect(hasDuplicateEnvKeys("not a real line\nFOO=a\n")).toBe(false);
  });

  it("returns false for empty content", () => {
    expect(hasDuplicateEnvKeys("")).toBe(false);
  });

  it("only counts the part before the first = as the key", () => {
    expect(hasDuplicateEnvKeys("FOO=a=b\nFOO=c\n")).toBe(true);
  });
});
