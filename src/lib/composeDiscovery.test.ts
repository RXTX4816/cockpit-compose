import { describe, it, expect } from "vitest";
import { inferComposeRoot } from "./composeDiscovery";
import type { ComposeStack } from "../api";

function makeStack(configFile: string): ComposeStack {
  return { Name: "app", Status: "running(1)", ConfigFiles: configFile };
}

describe("inferComposeRoot", () => {
  it("returns empty string for empty stacks array", () => {
    expect(inferComposeRoot([])).toBe("");
  });

  it("returns parent of single stack's config dir", () => {
    expect(inferComposeRoot([makeStack("/home/user/stacks/myapp/compose.yml")])).toBe("/home/user/stacks");
  });

  it("returns the most common parent directory", () => {
    const stacks = [
      makeStack("/home/user/stacks/myapp/compose.yml"),
      makeStack("/home/user/stacks/otherapp/compose.yml"),
      makeStack("/home/user/stacks/thirdapp/compose.yml"),
    ];
    expect(inferComposeRoot(stacks)).toBe("/home/user/stacks");
  });

  it("returns the most frequent parent when multiple roots exist", () => {
    const stacks = [
      makeStack("/home/user/stacks/a/compose.yml"),
      makeStack("/home/user/stacks/b/compose.yml"),
      makeStack("/srv/other/c/compose.yml"),
    ];
    expect(inferComposeRoot(stacks)).toBe("/home/user/stacks");
  });

  it("uses only the first config file when stack has multiple", () => {
    const stack = makeStack("/home/user/stacks/myapp/compose.yml, /home/user/stacks/myapp/compose.override.yml");
    expect(inferComposeRoot([stack])).toBe("/home/user/stacks");
  });

  it("returns empty string when stack path is too shallow to determine a parent", () => {
    // /compose.yml has no directory depth → parent resolves to "" → tally stays empty
    expect(inferComposeRoot([makeStack("/compose.yml")])).toBe("");
  });

  it("handles empty ConfigFiles string gracefully", () => {
    // splitConfigFiles("") returns [] → configFile is "" → no parent
    const stack: ComposeStack = { Name: "app", Status: "running(1)", ConfigFiles: "" };
    expect(inferComposeRoot([stack])).toBe("");
  });

  it("breaks ties alphabetically when two parents have equal frequency", () => {
    const stacks = [
      makeStack("/alpha/a/compose.yml"),
      makeStack("/beta/b/compose.yml"),
    ];
    // Both parents appear once; alphabetical tie-break picks "/alpha"
    expect(inferComposeRoot(stacks)).toBe("/alpha");
  });
});
