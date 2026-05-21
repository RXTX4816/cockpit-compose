import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { listContainers, getContainerStats } from "./containers";

beforeEach(() => { mockSpawn.mockReset(); });

describe("listContainers", () => {
  it("spawns compose ps --all --format json for the project", () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    listContainers("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("ps");
    expect(args).toContain("--all");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });
});

describe("getContainerStats", () => {
  it("spawns docker stats --no-stream with the given container IDs", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    getContainerStats(["abc123", "def456"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("docker");
    expect(args).toContain("stats");
    expect(args).toContain("--no-stream");
    expect(args).toContain("abc123");
    expect(args).toContain("def456");
  });

  it("includes a JSON format template in the args", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    getContainerStats(["abc"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const formatArg = args.find(a => a.includes("{{.CPUPerc}}"));
    expect(formatArg).toBeDefined();
  });
});
