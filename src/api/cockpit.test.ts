import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";

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
