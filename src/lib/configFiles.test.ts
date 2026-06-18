import { describe, it, expect } from "vitest";
import { splitConfigFiles } from "./configFiles";

describe("splitConfigFiles", () => {
  it("returns empty array for empty string", () => {
    expect(splitConfigFiles("")).toEqual([]);
  });

  it("returns single path", () => {
    expect(splitConfigFiles("/home/user/app/compose.yml")).toEqual(["/home/user/app/compose.yml"]);
  });

  it("splits comma-separated paths", () => {
    expect(splitConfigFiles("/a/compose.yml,/b/compose.yml")).toEqual(["/a/compose.yml", "/b/compose.yml"]);
  });

  it("trims whitespace around paths", () => {
    expect(splitConfigFiles("/a/compose.yml, /b/compose.yml")).toEqual(["/a/compose.yml", "/b/compose.yml"]);
  });

  it("filters out blank entries", () => {
    expect(splitConfigFiles("/a/compose.yml,,/b/compose.yml")).toEqual(["/a/compose.yml", "/b/compose.yml"]);
  });
});
