import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { buildUpStarter, buildPullStarter, buildDownStarter, buildRestartStarter, buildKillStarter } from "./backgroundActions";
import type { ComposeStack } from "../api";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" };

beforeEach(() => {
  mockSpawn.mockReset();
  // First call in each starter resolves the superuser/profile-reading setup calls
  mockSpawn.mockReturnValue(mockProcess(""));
});

describe("buildUpStarter", () => {
  it("launches upStackStream with the given profiles once superuser resolves", async () => {
    const starter = buildUpStarter(stack, ["dev"]);
    const launch = vi.fn();
    await starter(launch);
    expect(launch).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][0] as string[];
    expect(args).toContain("up");
    expect(args).toContain("myapp");
    expect(args).toContain("--profile");
    expect(args).toContain("dev");
  });
});

describe("buildPullStarter", () => {
  it("launches pullStack after resolving superuser and reading profiles", async () => {
    const starter = buildPullStarter(stack);
    const launch = vi.fn();
    await starter(launch);
    expect(launch).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][0] as string[];
    expect(args).toContain("pull");
    expect(args).toContain("myapp");
  });
});

describe("buildDownStarter", () => {
  it("launches downStack once superuser resolves", async () => {
    const starter = buildDownStarter(stack);
    const launch = vi.fn();
    await starter(launch);
    expect(launch).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][0] as string[];
    expect(args).toContain("down");
    expect(args).toContain("myapp");
  });
});

describe("buildRestartStarter", () => {
  it("launches restartStack once superuser resolves", async () => {
    const starter = buildRestartStarter(stack);
    const launch = vi.fn();
    await starter(launch);
    expect(launch).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][0] as string[];
    expect(args).toContain("restart");
    expect(args).toContain("myapp");
  });
});

describe("buildKillStarter", () => {
  it("launches killStack once superuser resolves", async () => {
    const starter = buildKillStarter(stack);
    const launch = vi.fn();
    await starter(launch);
    expect(launch).toHaveBeenCalledOnce();
    const killCall = mockSpawn.mock.calls.find(call => (call[0] as string[]).includes("kill"));
    expect(killCall).toBeTruthy();
    expect((killCall![0] as string[])).toContain("myapp");
  });
});
