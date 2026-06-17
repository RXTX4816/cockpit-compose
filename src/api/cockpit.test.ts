import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

beforeEach(() => {
  mockSpawn.mockReset();
  vi.resetModules();
});

describe("compose()", () => {
  it("prepends default docker compose prefix", async () => {
    const { compose } = await import("./cockpit");
    expect(compose("ls", "--all")).toEqual(["docker", "compose", "ls", "--all"]);
  });
});

describe("composeFileSuperuser()", () => {
  const mockUser = vi.fn();

  beforeEach(() => {
    mockUser.mockReset();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
  });

  // All stat-mock tests use mockImplementation so the mockProcess (and its queueMicrotask) is
  // created lazily at the time cockpit.spawn() is called — avoiding races where the
  // queueMicrotask fires before proc.stream(callback) has been registered.
  it("returns undefined when both parent dir and file are owned by current user", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    mockSpawn.mockImplementation(() => mockProcess("1000\n")); // dir and file both uid 1000
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/myapp/compose.yml"])).toBeUndefined();
  });

  it("returns 'try' when parent directory is owned by a different user", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    mockSpawn.mockImplementation(() => mockProcess("0\n")); // dir owned by root
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/myapp/compose.yml"])).toBe("try");
  });

  it("returns 'try' when file is owned by a different user", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    let spawnCount = 0;
    mockSpawn.mockImplementation(() => {
      spawnCount++;
      return mockProcess(spawnCount === 1 ? "1000\n" : "0\n"); // dir ok, file owned by root
    });
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/myapp/compose.yml"])).toBe("try");
  });

  it("returns undefined when file does not exist but parent dir is user-owned", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    // Use mockImplementation so the process (and its queueMicrotask) is created lazily
    // at the time cockpit.spawn() is called — avoiding unhandled-rejection races.
    let spawnCount = 0;
    mockSpawn.mockImplementation(() => {
      spawnCount++;
      return spawnCount === 1 ? mockProcess("1000\n") : mockProcess("", "No such file or directory");
    });
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/newapp/compose.yml"])).toBeUndefined();
  });

  it("returns 'try' when stat of parent dir fails", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    mockSpawn.mockImplementation(() => mockProcess("", "Permission denied"));
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/myapp/compose.yml"])).toBe("try");
  });

  it("returns 'try' when cockpit.user() rejects", async () => {
    mockUser.mockRejectedValue(new Error("no user"));
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser(["/home/user/myapp/compose.yml"])).toBe("try");
  });
});

describe("detectDockerMode()", () => {
  const mockUser = vi.fn();

  beforeEach(() => {
    mockUser.mockReset();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
  });

  it("sets rootless mode when user socket exists and DOCKER_HOST is unset", async () => {
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess(""); // DOCKER_HOST empty
      if (call === 2) return mockProcess("socket"); // user socket present
      return mockProcess("", "no such file"); // system socket absent
    });
    const { detectDockerMode, isRootlessMode, getDockerSocketPath } = await import("./cockpit");
    await detectDockerMode();
    expect(isRootlessMode()).toBe(true);
    expect(getDockerSocketPath()).toBe("unix:///run/user/1000/docker.sock");
  });

  it("sets system socket path when only system socket exists", async () => {
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess(""); // DOCKER_HOST empty
      if (call === 2) return mockProcess("", "no such file"); // user socket absent
      return mockProcess("socket"); // system socket present
    });
    const { detectDockerMode, isRootlessMode, getDockerSocketPath } = await import("./cockpit");
    await detectDockerMode();
    expect(isRootlessMode()).toBe(false);
    expect(getDockerSocketPath()).toBe("unix:///var/run/docker.sock");
  });

  it("respects DOCKER_HOST already set in environment", async () => {
    mockSpawn.mockImplementation(() => mockProcess("unix:///run/user/1000/docker.sock"));
    const { detectDockerMode, isRootlessMode, getDockerSocketPath } = await import("./cockpit");
    await detectDockerMode();
    expect(isRootlessMode()).toBe(true);
    expect(getDockerSocketPath()).toBe("unix:///run/user/1000/docker.sock");
    // Should not call cockpit.user() or check sockets when DOCKER_HOST is set
    expect(mockUser).not.toHaveBeenCalled();
  });

  it("marks non-user DOCKER_HOST as non-rootless", async () => {
    mockSpawn.mockImplementation(() => mockProcess("unix:///var/run/docker.sock"));
    const { detectDockerMode, isRootlessMode } = await import("./cockpit");
    await detectDockerMode();
    expect(isRootlessMode()).toBe(false);
  });

  it("leaves everything unset when neither socket exists", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "no such file"));
    const { detectDockerMode, isRootlessMode, getDockerSocketPath } = await import("./cockpit");
    await detectDockerMode();
    expect(isRootlessMode()).toBe(false);
    expect(getDockerSocketPath()).toBeUndefined();
  });
});

describe("detectComposeCommand()", () => {
  it("returns true and sets docker compose prefix when found", async () => {
    mockSpawn.mockResolvedValue("");
    const { detectComposeCommand, compose } = await import("./cockpit");
    expect(await detectComposeCommand()).toBe(true);
    expect(compose("ls")).toEqual(["docker", "compose", "ls"]);
    expect(mockSpawn).toHaveBeenCalledWith(["docker", "compose", "version"], expect.anything());
  });

  it("returns true and falls back to docker-compose when docker compose version fails", async () => {
    mockSpawn
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce("");
    const { detectComposeCommand, compose } = await import("./cockpit");
    expect(await detectComposeCommand()).toBe(true);
    expect(compose("ls")).toEqual(["docker-compose", "ls"]);
  });

  it("returns false and falls back to docker compose when both commands fail", async () => {
    mockSpawn
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("not found"));
    const { detectComposeCommand, compose } = await import("./cockpit");
    expect(await detectComposeCommand()).toBe(false);
    expect(compose("ls")).toEqual(["docker", "compose", "ls"]);
  });

  it("is idempotent — only spawns for version+progress probe on first call, not second", async () => {
    mockSpawn.mockResolvedValue("");
    const { detectComposeCommand } = await import("./cockpit");
    await detectComposeCommand();
    await detectComposeCommand();
    // first call: version probe + --progress plain probe = 2 spawns; second call hits cache
    expect(mockSpawn).toHaveBeenCalledTimes(2);
  });

  // Podman tests need cockpit.user mocked (for detectPodmanSocket) and must account
  // for the two stat calls that check for the Podman socket before version detection.
  it("returns true and uses podman compose prefix when runtime is podman", async () => {
    const mockUser = vi.fn().mockResolvedValue({ id: 1000 });
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    // stat calls return "" (not "socket") → no Podman socket found; compose version succeeds
    mockSpawn.mockResolvedValue("");
    const { setRuntime, detectComposeCommand, compose } = await import("./cockpit");
    setRuntime("podman");
    expect(await detectComposeCommand()).toBe(true);
    expect(compose("ls")).toEqual(["podman", "compose", "ls"]);
    expect(mockSpawn).toHaveBeenCalledWith(["podman", "compose", "version"], expect.anything());
  });

  it("returns true and falls back to podman-compose when podman compose version fails", async () => {
    const mockUser = vi.fn().mockResolvedValue({ id: 1000 });
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    mockSpawn
      .mockRejectedValueOnce(new Error("no socket"))  // stat: user podman socket absent
      .mockRejectedValueOnce(new Error("no socket"))  // stat: system podman socket absent
      .mockRejectedValueOnce(new Error("not found"))  // podman compose version fails
      .mockResolvedValueOnce("")                       // podman-compose version succeeds
      .mockRejectedValueOnce(new Error("unknown flag")); // --progress plain probe fails
    const { setRuntime, detectComposeCommand, compose, composeSupportsProgress } = await import("./cockpit");
    setRuntime("podman");
    expect(await detectComposeCommand()).toBe(true);
    expect(compose("ls")).toEqual(["podman-compose", "ls"]);
    expect(composeSupportsProgress()).toBe(false);
  });

  // Fedora: `podman compose` delegates to the standalone podman-compose binary, which
  // doesn't support --progress plain. The probe detects this at startup.
  it("detects that podman compose delegates to podman-compose and disables --progress", async () => {
    const mockUser = vi.fn().mockResolvedValue({ id: 1000 });
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    mockSpawn
      .mockResolvedValueOnce("")                       // stat: user podman socket (not a socket)
      .mockResolvedValueOnce("")                       // stat: system podman socket (not a socket)
      .mockResolvedValueOnce("")                       // podman compose version succeeds
      .mockRejectedValueOnce(new Error("invalid choice: 'plain'")); // --progress plain probe fails
    const { setRuntime, detectComposeCommand, compose, composeSupportsProgress } = await import("./cockpit");
    setRuntime("podman");
    expect(await detectComposeCommand()).toBe(true);
    expect(compose("ls")).toEqual(["podman", "compose", "ls"]);
    expect(composeSupportsProgress()).toBe(false);
  });

  it("returns false when neither podman compose nor podman-compose is found", async () => {
    const mockUser = vi.fn().mockResolvedValue({ id: 1000 });
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
    mockSpawn
      .mockRejectedValueOnce(new Error("no socket"))  // stat: user podman socket absent
      .mockRejectedValueOnce(new Error("no socket"))  // stat: system podman socket absent
      .mockRejectedValueOnce(new Error("not-found"))  // podman compose version fails
      .mockRejectedValueOnce(new Error("not-found")); // podman-compose version fails
    const { setRuntime, detectComposeCommand } = await import("./cockpit");
    setRuntime("podman");
    expect(await detectComposeCommand()).toBe(false);
  });
});

describe("detectPodmanSocket() via detectComposeCommand()", () => {
  const mockUser = vi.fn();

  beforeEach(() => {
    mockUser.mockReset();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
  });

  it("sets rootless podman socket when user socket exists", async () => {
    mockUser.mockResolvedValue({ id: 1000 });
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess("socket"); // user podman socket present
      return mockProcess(""); // compose version succeeds
    });
    const { setRuntime, detectComposeCommand, getPodmanSocketPath, isRootlessMode, dockerSpawnEnviron } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    expect(getPodmanSocketPath()).toBe("unix:///run/user/1000/podman/podman.sock");
    expect(isRootlessMode()).toBe(true);
    expect(dockerSpawnEnviron()).toEqual({ environ: ["DOCKER_HOST=unix:///run/user/1000/podman/podman.sock", "XDG_RUNTIME_DIR=/run/user/1000"] });
  });

  it("sets system podman socket when only system socket exists", async () => {
    mockUser.mockResolvedValue({ id: 1000 });
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess("", "no such file"); // user socket absent
      if (call === 2) return mockProcess("socket");           // system socket present
      return mockProcess("");                                  // compose version succeeds
    });
    const { setRuntime, detectComposeCommand, getPodmanSocketPath, isRootlessMode } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    expect(getPodmanSocketPath()).toBe("unix:///run/podman/podman.sock");
    expect(isRootlessMode()).toBe(false);
  });

  it("leaves podman socket unset when no socket exists", async () => {
    mockUser.mockResolvedValue({ id: 1000 });
    mockSpawn
      .mockRejectedValueOnce(new Error("no such file")) // user socket absent
      .mockRejectedValueOnce(new Error("no such file")) // system socket absent
      .mockResolvedValue("");                            // compose version succeeds
    const { setRuntime, detectComposeCommand, getPodmanSocketPath, dockerSpawnEnviron } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    expect(getPodmanSocketPath()).toBeUndefined();
    expect(dockerSpawnEnviron()).toEqual({});
  });

  it("is idempotent — socket detection only runs once across multiple calls", async () => {
    mockUser.mockResolvedValue({ id: 1000 });
    mockSpawn.mockResolvedValue("");
    const { setRuntime, detectComposeCommand } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    await detectComposeCommand(); // second call hits prefix cache, socket already detected
    // stat for user socket + compose version = 2 calls on first run; second run is fully cached
    expect(mockUser).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully when cockpit.user() throws during socket detection", async () => {
    mockUser.mockRejectedValue(new Error("unavailable"));
    // after user() throws, only the system socket stat is tried
    mockSpawn
      .mockRejectedValueOnce(new Error("no such file")) // system socket absent
      .mockResolvedValueOnce("");                        // compose version succeeds
    const { setRuntime, detectComposeCommand, getPodmanSocketPath } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    expect(getPodmanSocketPath()).toBeUndefined();
  });
});

describe("dockerSpawnEnviron() runtime awareness", () => {
  const mockUser = vi.fn();

  beforeEach(() => {
    mockUser.mockReset();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
  });

  it("returns docker environ for docker runtime", async () => {
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess("");       // DOCKER_HOST empty
      if (call === 2) return mockProcess("socket"); // user docker socket present
      return mockProcess("");
    });
    mockUser.mockResolvedValue({ id: 1000 });
    const { detectDockerMode, dockerSpawnEnviron } = await import("./cockpit");
    await detectDockerMode();
    expect(dockerSpawnEnviron()).toEqual({ environ: ["DOCKER_HOST=unix:///run/user/1000/docker.sock"] });
  });

  it("returns podman environ for podman runtime", async () => {
    mockUser.mockResolvedValue({ id: 1000 });
    let call = 0;
    mockSpawn.mockImplementation(() => {
      call++;
      if (call === 1) return mockProcess("socket"); // user podman socket present
      return mockProcess("");
    });
    const { setRuntime, detectComposeCommand, dockerSpawnEnviron } = await import("./cockpit");
    setRuntime("podman");
    await detectComposeCommand();
    expect(dockerSpawnEnviron()).toEqual({ environ: ["DOCKER_HOST=unix:///run/user/1000/podman/podman.sock", "XDG_RUNTIME_DIR=/run/user/1000"] });
  });

  it("returns {} when no socket is configured for the active runtime", async () => {
    mockSpawn.mockResolvedValue(""); // all stat checks return "" → not a socket
    mockUser.mockResolvedValue({ id: 1000 });
    const { detectComposeCommand, dockerSpawnEnviron } = await import("./cockpit");
    await detectComposeCommand(); // docker runtime, no rootless socket
    expect(dockerSpawnEnviron()).toEqual({});
  });
});
