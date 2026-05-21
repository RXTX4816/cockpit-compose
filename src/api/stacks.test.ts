import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { listStacks, startStack, stopStack, restartStack, streamLogs, downStack, pullStack } from "./stacks";

beforeEach(() => { mockSpawn.mockReset(); });

describe("listStacks", () => {
  it("spawns compose ls --all --format json", () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    listStacks();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ls");
    expect(args).toContain("--all");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });
});

describe("startStack", () => {
  it("spawns compose up -d with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    startStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
    expect(args).toContain("up");
    expect(args).toContain("-d");
  });
});

describe("stopStack", () => {
  it("spawns compose stop with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    stopStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("stop");
    expect(args).toContain("myapp");
  });
});

describe("restartStack", () => {
  it("spawns compose restart with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    restartStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("restart");
  });
});

describe("streamLogs", () => {
  it("spawns compose logs --follow with timestamps", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    streamLogs("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("logs");
    expect(args).toContain("--follow");
    expect(args).toContain("--timestamps");
  });
});

describe("downStack", () => {
  it("spawns compose down with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    downStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("down");
    expect(args).toContain("myapp");
  });
});

describe("pullStack", () => {
  it("spawns compose pull with plain progress", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("pull");
    expect(args).toContain("--progress");
    expect(args).toContain("plain");
  });

  it("merges stderr into stdout (err: out)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", "/path/compose.yml");
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });
});
