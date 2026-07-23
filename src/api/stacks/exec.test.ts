import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { composeRunStream } from "./exec";

beforeEach(() => { mockSpawn.mockReset(); mockSpawn.mockReturnValue(mockProcess("")); });

describe("composeRunStream", () => {
  it("'args' mode appends the typed tokens as CMD arguments to the image's entrypoint", () => {
    composeRunStream("myapp", ["/path/compose.yml"], "web", { mode: "args", command: ["--help"] }, false);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("run");
    expect(args).toContain("web");
    expect(args).toContain("--help");
    expect(args).not.toContain("--entrypoint");
  });

  it("'override' mode replaces the entrypoint with the command's first token", () => {
    composeRunStream("myapp", ["/path/compose.yml"], "web", { mode: "override", command: ["/bin/sh", "-c", "echo hi"] }, false);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const entrypointIdx = args.indexOf("--entrypoint");
    expect(entrypointIdx).toBeGreaterThanOrEqual(0);
    expect(args[entrypointIdx + 1]).toBe("/bin/sh");
    // Only the remaining tokens (after the entrypoint binary) should appear as trailing args
    expect(args).toContain("-c");
    expect(args).toContain("echo hi");
  });

  it("includes --rm when rm is true", () => {
    composeRunStream("myapp", ["/path/compose.yml"], "web", { mode: "args", command: [] }, true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--rm");
  });

  it("passes superuser through to the spawn", () => {
    composeRunStream("myapp", ["/path/compose.yml"], "web", { mode: "args", command: [] }, false, "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});
