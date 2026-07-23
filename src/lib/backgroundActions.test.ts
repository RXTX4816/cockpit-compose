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

describe("stackSuperuser() escalation (background flow)", () => {
  // Regression test: this file used to have its own duplicate copy of the superuser-resolution
  // logic (a local `resolveSuperuser`) which fell back to file-ownership-based escalation for
  // Podman's rootful mode — the opposite bug from the one fixed in stackSuperuser() itself, but
  // from the same root cause (file ownership must never override an explicit Podman socket-mode
  // selection). Now that every starter here delegates straight to the shared, already-tested
  // stackSuperuser() instead of resolving its own copy, this just proves the value genuinely
  // flows through end-to-end into the spawned command, rather than being silently dropped.
  it("passes stackSuperuser()'s resolved value through to the spawned down command", async () => {
    mockSpawn.mockImplementation(() => mockProcess("0\n")); // dir/file owned by root (uid 0)
    const launch = vi.fn();
    await buildDownStarter(stack)(launch);
    expect(launch).toHaveBeenCalledOnce();
    const spawnCallOptions = mockSpawn.mock.calls.find(call => (call[0] as string[]).includes("down"))?.[1] as
      { superuser?: "try" } | undefined;
    // Default test environment has no cockpit.user() available, so composeFileSuperuser (and
    // therefore stackSuperuser, for the default docker runtime) fails safe to "try".
    expect(spawnCallOptions?.superuser).toBe("try");
  });
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
