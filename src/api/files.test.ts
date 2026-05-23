import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

const mockReplace = vi.fn().mockResolvedValue(undefined);
const mockFileHandle = { replace: mockReplace };
const mockCockpitFile = vi.fn().mockReturnValue(mockFileHandle);

beforeEach(() => {
  mockSpawn.mockReset();
  mockReplace.mockReset();
  mockCockpitFile.mockReset().mockReturnValue(mockFileHandle);
  vi.stubGlobal("cockpit", { spawn: mockSpawn, file: mockCockpitFile });
});

describe("readComposeFile", () => {
  it("spawns cat on the given path", async () => {
    const { readComposeFile } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("content"));
    readComposeFile("/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["cat", "/path/compose.yml"]);
  });
});

describe("saveComposeFile", () => {
  it("calls cockpit.file().replace() without superuser when not provided", async () => {
    const { saveComposeFile } = await import("./files");
    await saveComposeFile("/path/compose.yml", "services:\n  web:\n");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/compose.yml", { superuser: undefined });
    expect(mockReplace).toHaveBeenCalledWith("services:\n  web:\n");
  });

  it("passes superuser: try when provided", async () => {
    const { saveComposeFile } = await import("./files");
    await saveComposeFile("/path/compose.yml", "services:\n  web:\n", "try");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/compose.yml", { superuser: "try" });
  });
});

describe("saveSnapshot", () => {
  it("writes snapshot file with timestamp suffix and returns Snapshot", async () => {
    const { saveSnapshot } = await import("./files");
    const before = Date.now();
    const snap = await saveSnapshot("/path/compose.yml", "content");
    const after = Date.now();
    expect(snap.path).toMatch(/\/path\/compose\.yml\.snapshot\.\d+/);
    expect(snap.timestamp).toBeGreaterThanOrEqual(before);
    expect(snap.timestamp).toBeLessThanOrEqual(after);
    expect(snap.name).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith("content");
  });
});

describe("listSnapshots", () => {
  it("spawns find in the directory for .snapshot.* files", async () => {
    const { listSnapshots } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    listSnapshots("/path/to/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/path/to");
    expect(args.some(a => a.includes("compose.yml.snapshot.*"))).toBe(true);
  });
});

describe("restoreSnapshot", () => {
  it("returns the content of the snapshot file", async () => {
    const { restoreSnapshot } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("restored content"));
    const content = await restoreSnapshot("/path/compose.yml.snapshot.123");
    expect(content).toBe("restored content");
  });
});

describe("deleteSnapshot", () => {
  it("spawns rm on the snapshot path", async () => {
    const { deleteSnapshot } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await deleteSnapshot("/path/compose.yml.snapshot.123");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["rm", "/path/compose.yml.snapshot.123"]);
  });
});

describe("findComposeFiles", () => {
  it("spawns find with maxdepth 2 on the given directory", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/etc/docker/compose");
    expect(args).toContain("-maxdepth");
    expect(args).toContain("2");
    expect(args).toContain("compose.yml");
    expect(args).toContain("docker-compose.yml");
  });

  it("passes no superuser by default", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBeUndefined();
  });

  it("passes superuser: try when provided", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});
