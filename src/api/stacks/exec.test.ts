import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { composeRunStream, snapshotProjectContainerIds, forceRemoveOneoffContainers } from "./exec";

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

describe("snapshotProjectContainerIds", () => {
  it("returns the set of container ids currently belonging to the project", async () => {
    mockSpawn.mockReturnValue(mockProcess("c1\nc2\n"));
    const ids = await snapshotProjectContainerIds("myapp");
    expect(ids).toEqual(new Set(["c1", "c2"]));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("label=com.docker.compose.project=myapp");
  });

  it("returns an empty set when the spawn fails", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "no such project"));
    const ids = await snapshotProjectContainerIds("myapp");
    expect(ids).toEqual(new Set());
  });
});

describe("forceRemoveOneoffContainers", () => {
  it("force-removes only container ids not present in the pre-run snapshot", async () => {
    mockSpawn.mockReturnValueOnce(mockProcess("c1\nc2\nc3\n"));
    await forceRemoveOneoffContainers("myapp", new Set(["c1", "c2"]));
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    const rmArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(rmArgs).toEqual(["docker", "rm", "-f", "c3"]);
  });

  it("does not call rm when no new containers appeared", async () => {
    mockSpawn.mockReturnValueOnce(mockProcess("c1\nc2\n"));
    await forceRemoveOneoffContainers("myapp", new Set(["c1", "c2"]));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
