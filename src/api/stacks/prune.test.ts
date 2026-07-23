import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { listAllImages, listInUseImageIds, pruneImages } from "./prune";

beforeEach(() => { mockSpawn.mockReset(); });

describe("listAllImages", () => {
  it("lists every image host-wide (including dangling) with full ids", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listAllImages();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("images");
    expect(args).toContain("-a");
    expect(args).toContain("--no-trunc");
    expect(args.join(" ")).toContain("{{.ID}}");
  });
});

describe("listInUseImageIds", () => {
  it("returns [] without inspecting when there are no containers", async () => {
    mockSpawn.mockReturnValueOnce(mockProcess(""));
    const ids = await listInUseImageIds();
    expect(ids).toEqual([]);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("inspects every container id to get the image ids actually in use", async () => {
    mockSpawn
      .mockImplementationOnce(() => mockProcess("c1\nc2\n"))
      .mockImplementationOnce(() => mockProcess("sha256:aaa\nsha256:bbb\n"));
    const ids = await listInUseImageIds();
    expect(ids).toEqual(["sha256:aaa", "sha256:bbb"]);
    const inspectArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(inspectArgs).toContain("inspect");
    expect(inspectArgs).toContain("c1");
    expect(inspectArgs).toContain("c2");
  });
});

describe("pruneImages", () => {
  it("runs the native image prune with -a (all unused, not just dangling)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pruneImages();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("image");
    expect(args).toContain("prune");
    expect(args).toContain("-a");
    expect(args).toContain("-f");
  });

  it("merges stderr into stdout (err: out)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pruneImages();
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });
});
