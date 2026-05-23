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
    expect(await composeFileSuperuser("/home/user/myapp/compose.yml")).toBeUndefined();
  });

  it("returns 'try' when parent directory is owned by a different user", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    mockSpawn.mockImplementation(() => mockProcess("0\n")); // dir owned by root
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser("/home/user/myapp/compose.yml")).toBe("try");
  });

  it("returns 'try' when file is owned by a different user", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    let spawnCount = 0;
    mockSpawn.mockImplementation(() => {
      spawnCount++;
      return mockProcess(spawnCount === 1 ? "1000\n" : "0\n"); // dir ok, file owned by root
    });
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser("/home/user/myapp/compose.yml")).toBe("try");
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
    expect(await composeFileSuperuser("/home/user/newapp/compose.yml")).toBeUndefined();
  });

  it("returns 'try' when stat of parent dir fails", async () => {
    mockUser.mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
    mockSpawn.mockImplementation(() => mockProcess("", "Permission denied"));
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser("/home/user/myapp/compose.yml")).toBe("try");
  });

  it("returns 'try' when cockpit.user() rejects", async () => {
    mockUser.mockRejectedValue(new Error("no user"));
    const { composeFileSuperuser } = await import("./cockpit");
    expect(await composeFileSuperuser("/home/user/myapp/compose.yml")).toBe("try");
  });
});

describe("detectComposeCommand()", () => {
  it("keeps docker compose prefix when docker compose version succeeds", async () => {
    mockSpawn.mockResolvedValue("");
    const { detectComposeCommand, compose } = await import("./cockpit");
    await detectComposeCommand();
    expect(compose("ls")).toEqual(["docker", "compose", "ls"]);
    expect(mockSpawn).toHaveBeenCalledWith(["docker", "compose", "version"], expect.anything());
  });

  it("falls back to docker-compose when docker compose version fails", async () => {
    mockSpawn
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce("");
    const { detectComposeCommand, compose } = await import("./cockpit");
    await detectComposeCommand();
    expect(compose("ls")).toEqual(["docker-compose", "ls"]);
  });

  it("falls back to docker compose when both commands fail", async () => {
    mockSpawn
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("not found"));
    const { detectComposeCommand, compose } = await import("./cockpit");
    await detectComposeCommand();
    expect(compose("ls")).toEqual(["docker", "compose", "ls"]);
  });

  it("is idempotent — only spawns once even when called twice", async () => {
    mockSpawn.mockResolvedValue("");
    const { detectComposeCommand } = await import("./cockpit");
    await detectComposeCommand();
    await detectComposeCommand();
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
