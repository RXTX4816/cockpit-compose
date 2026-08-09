import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { setRuntime, detectComposeCommand } from "../cockpit";
import {
  startStack, stopStack, startService, stopService, restartStack, downStack,
  upStackStream, pullStack, pauseStack, unpauseStack, killStack, scaleStack,
} from "./lifecycle";

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue(mockProcess(""));
  setRuntime("docker");
});

describe("startStack", () => {
  it("runs compose up -d for the project with its config files", () => {
    startStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "up", "-d"]);
  });

  it("adds --profile flags for each selected profile", () => {
    startStack("myapp", ["/myapp/compose.yml"], ["dev", "monitoring"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "--profile", "dev", "--profile", "monitoring", "-p", "myapp", "-f", "/myapp/compose.yml", "up", "-d"]);
  });

  it("passes superuser through", () => {
    startStack("myapp", ["/myapp/compose.yml"], [], "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("stopStack", () => {
  it("runs compose stop for the project", () => {
    stopStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "stop"]);
  });
});

describe("startService / stopService", () => {
  it("startService targets a single service name", () => {
    startService("myapp", ["/myapp/compose.yml"], "web");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "up", "-d", "web"]);
  });

  it("stopService targets a single service name", () => {
    stopService("myapp", ["/myapp/compose.yml"], "web");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "stop", "web"]);
  });
});

describe("restartStack", () => {
  it("restarts the whole project when no services are given", () => {
    restartStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "restart"]);
  });

  it("restarts only the named services when given", () => {
    restartStack("myapp", ["/myapp/compose.yml"], [], ["web", "cache"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.slice(-2)).toEqual(["web", "cache"]);
  });
});

describe("downStack", () => {
  it("runs compose down for the project", () => {
    downStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "down"]);
  });
});

describe("upStackStream", () => {
  it("merges stdout+stderr via err:'out' so progress output isn't lost", () => {
    upStackStream("myapp", ["/myapp/compose.yml"], []);
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });

  it("uses --progress plain when the backend supports it (default docker prefix)", () => {
    upStackStream("myapp", ["/myapp/compose.yml"], []);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--progress");
    expect(args).toContain("plain");
  });
});

describe("pullStack", () => {
  it("runs compose pull with merged output", () => {
    pullStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("pull");
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });
});

describe("pauseStack / unpauseStack", () => {
  it("docker mode: runs compose pause directly", () => {
    pauseStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "pause"]);
  });

  it("docker mode: runs compose unpause directly", () => {
    unpauseStack("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "unpause"]);
  });

  it("podman mode: falls back to ps + native pause on each container id", async () => {
    setRuntime("podman");
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "c1" }, { Id: "c2" }])))
      .mockImplementationOnce(() => mockProcess(""));
    const proc = pauseStack("myapp", ["/myapp/compose.yml"]);
    await proc;
    const psArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(psArgs).toEqual(["podman", "ps", "-a", "--filter", "label=com.docker.compose.project=myapp", "--format", "json"]);
    const pauseArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(pauseArgs).toEqual(["podman", "pause", "c1", "c2"]);
  });

  it("podman mode: no-ops when there are no matching containers", async () => {
    setRuntime("podman");
    mockSpawn.mockImplementationOnce(() => mockProcess("[]"));
    const proc = pauseStack("myapp", ["/myapp/compose.yml"]);
    await proc;
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("podman mode: surfaces a friendly error when the native pause fails on cgroup delegation", async () => {
    setRuntime("podman");
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "c1" }])))
      .mockImplementationOnce(() => mockProcess("", "cgroup v2 delegation is required"));
    const proc = pauseStack("myapp", ["/myapp/compose.yml"]);
    await expect(proc).rejects.toThrow(/rootless Podman/);
  });

  it("podman mode: rethrows non-cgroup errors from the native pause unchanged", async () => {
    setRuntime("podman");
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "c1" }])))
      .mockImplementationOnce(() => mockProcess("", "no such container"));
    const proc = pauseStack("myapp", ["/myapp/compose.yml"]);
    await expect(proc).rejects.toThrow(/no such container/);
  });
});

describe("killStack", () => {
  it("sends SIGKILL via compose kill, then force-removes any leftover containers", async () => {
    mockSpawn
      .mockImplementationOnce(() => mockProcess(""))
      .mockImplementationOnce(() => mockProcess("c1\nc2\n"))
      .mockImplementationOnce(() => mockProcess(""));
    await killStack("myapp", ["/myapp/compose.yml"]);
    const killArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(killArgs).toContain("kill");
    const psArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(psArgs).toContain("ps");
    const rmArgs = mockSpawn.mock.calls[2][0] as string[];
    expect(rmArgs).toEqual(["docker", "rm", "-f", "c1", "c2"]);
  });

  it("tolerates compose kill failing (e.g. nothing running) and still cleans up leftovers", async () => {
    mockSpawn
      .mockImplementationOnce(() => mockProcess("", "no containers to kill"))
      .mockImplementationOnce(() => mockProcess("c1\n"))
      .mockImplementationOnce(() => mockProcess(""));
    await expect(killStack("myapp", ["/myapp/compose.yml"])).resolves.not.toThrow();
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  it("skips the rm step when no leftover containers are found", async () => {
    mockSpawn
      .mockImplementationOnce(() => mockProcess(""))
      .mockImplementationOnce(() => mockProcess(""));
    await killStack("myapp", ["/myapp/compose.yml"]);
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});

describe("scaleStack", () => {
  it("docker mode: runs compose up -d --scale per service", () => {
    scaleStack("myapp", ["/myapp/compose.yml"], { worker: 3 });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "-f", "/myapp/compose.yml", "up", "-d", "--scale", "worker=3"]);
  });

  async function forcePodmanLimitedBackend(): Promise<void> {
    // composeIsLimitedBackend() requires composeSupportsProgress() to be false, which is
    // only known after detection — reuse the same detection flow as cockpit.test.ts's
    // "falls back to podman-compose" case to get there for real, not by poking internals.
    const mockUser = () => Promise.resolve({ id: 1000 });
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    mockSpawn
      .mockRejectedValueOnce(new Error("no socket"))
      .mockRejectedValueOnce(new Error("no socket"))
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce("")
      .mockRejectedValueOnce(new Error("unknown flag"));
    setRuntime("podman");
    await detectComposeCommand();
    mockSpawn.mockReset();
    vi.stubGlobal("cockpit", { spawn: mockSpawn });
  }

  it("podman fallback (limited backend): recreates then trims excess replicas by id", async () => {
    await forcePodmanLimitedBackend();
    mockSpawn
      .mockImplementationOnce(() => mockProcess(""))                                    // up --force-recreate --scale
      .mockImplementationOnce(() => mockProcess(JSON.stringify([                          // ps for worker
        { Id: "w1", Names: ["myapp_worker_1"] },
        { Id: "w2", Names: ["myapp_worker_2"] },
        { Id: "w3", Names: ["myapp_worker_3"] },
      ])))
      .mockImplementationOnce(() => mockProcess(""))                                    // stop excess
      .mockImplementationOnce(() => mockProcess(""));                                   // rm excess
    const proc = scaleStack("myapp", ["/myapp/compose.yml"], { worker: 2 });
    await proc;
    const upArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(upArgs).toContain("--force-recreate");
    expect(upArgs).toContain("--scale");
    expect(upArgs).toContain("worker=2");
    const stopArgs = mockSpawn.mock.calls[2][0] as string[];
    // Highest-numbered replica (worker-3) is trimmed first
    expect(stopArgs).toEqual(["podman", "stop", "w3"]);
    const rmArgs = mockSpawn.mock.calls[3][0] as string[];
    expect(rmArgs).toEqual(["podman", "rm", "w3"]);
  });

  it("podman fallback: does not stop/rm anything when already at or below target count", async () => {
    await forcePodmanLimitedBackend();
    mockSpawn
      .mockImplementationOnce(() => mockProcess(""))
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "w1", Names: ["myapp_worker_1"] }])));
    const proc = scaleStack("myapp", ["/myapp/compose.yml"], { worker: 3 });
    await proc;
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });
});
