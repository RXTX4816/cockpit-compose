import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { setRuntime, detectDockerMode } from "../cockpit";
import type { ComposeStack } from "../types";
import { stackOperations } from "./operations";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const COMPOSE = "services:\n  web:\n    image: nginx\n    profiles: [dev]\n";

function downCall() {
  return mockSpawn.mock.calls.find(c => (c[0] as string[]).includes("down"));
}

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  mockSpawn.mockImplementation((argv: string[]) => mockProcess(argv[0] === "cat" ? COMPOSE : ""));
});

function composeCall(verb: string) {
  return mockSpawn.mock.calls.find(c => {
    const a = c[0] as string[];
    return a[1] === "compose" && a.includes(verb);
  });
}

describe("stackOperations lifecycle", () => {
  it.each(["start", "stop", "pause", "unpause", "kill"] as const)(
    "%s runs for the stack with the profiles its file declares, escalated", async op => {
      await stackOperations[op](stack);
      const verb = op === "start" ? "up" : op;
      const call = composeCall(verb);
      expect(call?.[0]).toEqual(["docker", "compose", "--profile", "dev", "-p", "myapp", "-f", "/srv/myapp/compose.yml", verb, ...(op === "start" ? ["-d"] : [])]);
      expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
    });

  it("pull uses the stack's profiles", async () => {
    await stackOperations.pull(stack);
    expect(composeCall("pull")?.[0]).toContain("dev");
  });

  it("up activates only the profiles it is given, none by default", async () => {
    await stackOperations.up(stack);
    expect(composeCall("up")?.[0]).not.toContain("--profile");
    mockSpawn.mockClear();
    await stackOperations.up(stack, { profiles: ["ops"] });
    expect(composeCall("up")?.[0]).toEqual(expect.arrayContaining(["--profile", "ops"]));
  });

  describe("restart", () => {
    const running = (argv: string[]) => mockProcess(argv.includes("status=running") ? "web\ncache\n" : argv[0] === "cat" ? COMPOSE : "");

    it("restarts the services that are running", async () => {
      mockSpawn.mockImplementation(running);
      await stackOperations.restart(stack);
      expect(composeCall("restart")?.[0]).toEqual(
        ["docker", "compose", "--profile", "dev", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "restart", "web", "cache"]);
    });

    it("restarts just the services it is given", async () => {
      mockSpawn.mockImplementation(running);
      await stackOperations.restart(stack, { services: ["db"] });
      expect(composeCall("restart")?.[0]?.slice(-2)).toEqual(["restart", "db"]);
    });

    it("does nothing when no service is running", async () => {
      await stackOperations.restart(stack);
      expect(composeCall("restart")).toBeUndefined();
    });
  });
});

describe("stackOperations.down", () => {
  it("runs compose down for the stack, with the profiles its compose file declares", async () => {
    await stackOperations.down(stack);
    expect(downCall()?.[0]).toEqual(
      ["docker", "compose", "--profile", "dev", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "down"]);
  });

  it("uses an explicit profile list instead of reading the file", async () => {
    await stackOperations.down(stack, { profiles: ["ops"] });
    expect(downCall()?.[0]).toEqual(
      ["docker", "compose", "--profile", "ops", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "down"]);
  });

  it("can be cancelled before it starts, in which case nothing is taken down", async () => {
    const proc = stackOperations.down(stack);
    proc.close();
    await expect(proc).rejects.toThrow();
    expect(downCall()).toBeUndefined();
  });

  it("closing the process after it has started stops the running compose down", async () => {
    let downProc: CockpitProcess | undefined;
    mockSpawn.mockImplementation((argv: string[]) => {
      const proc = mockProcess(argv[0] === "cat" ? COMPOSE : "");
      if (argv.includes("down")) downProc = proc;
      return proc;
    });
    const proc = stackOperations.down(stack);
    await vi.waitFor(() => expect(downProc).toBeDefined());
    proc.close();
    expect(downProc!.close).toHaveBeenCalledOnce();
    await proc;
  });

  // Kept last: detecting a rootless socket changes module state for the tests after it.
  it("decides escalation itself: rootless Docker and user-owned files need no admin rights", async () => {
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: vi.fn().mockResolvedValue({ id: 1000, name: "u", home: "/home/u" }) });
    mockSpawn.mockImplementation((argv: string[]) => {
      if (argv[0] === "stat" && argv.includes("%F")) return mockProcess("socket");
      if (argv[0] === "stat") return mockProcess("1000\n");
      return mockProcess(argv[0] === "cat" ? COMPOSE : "");
    });
    await detectDockerMode();
    await stackOperations.down(stack);
    expect((downCall()?.[1] as { superuser?: string }).superuser).toBeUndefined();
  });
});
