import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import * as cockpitMod from "../cockpit";
import { setRuntime } from "../cockpit";
import { findStackLeftovers, planDamagedRepair, runDamagedRepair } from "./leftovers";

const GOOD = "a".repeat(64);
const GHOST = "b".repeat(64);

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
});
afterEach(() => vi.restoreAllMocks());

describe("findStackLeftovers", () => {
  it("reports nothing when Docker lists no containers for the project", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [], damaged: [] });
  });

  // The signature of a damaged record: ps -a lists it, inspect cannot find it.
  it("flags IDs Docker lists but cannot inspect as damaged", async () => {
    mockSpawn.mockImplementation((args: string[]) => {
      if (args.includes("ps")) return mockProcess(`${GOOD}\n${GHOST}\n`);
      if (args.includes("inspect") && args.includes(GHOST)) return mockProcess("", `Error: No such object: ${GHOST}`);
      return mockProcess(GOOD);
    });
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [GOOD, GHOST], damaged: [GHOST] });
    const psCall = mockSpawn.mock.calls.map(c => c[0] as string[]).find(a => a.includes("ps"))!;
    expect(psCall).toContain("--no-trunc");
    expect(psCall).toContain("label=com.docker.compose.project=gotify");
  });

  it("does not treat other inspect failures as damage", async () => {
    mockSpawn.mockImplementation((args: string[]) => {
      if (args.includes("ps")) return mockProcess(`${GOOD}\n`);
      return mockProcess("", "permission denied while trying to connect to the Docker daemon socket");
    });
    expect((await findStackLeftovers("gotify")).damaged).toEqual([]);
  });

  it("never flags damage on Podman, where the repair does not apply", async () => {
    setRuntime("podman");
    mockSpawn.mockImplementation((args: string[]) => args.includes("ps") ? mockProcess(`${GHOST}\n`) : mockProcess("", "no such object"));
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [GHOST], damaged: [] });
  });
});

describe("planDamagedRepair", () => {
  it("uses systemctl --user and the rootless data root for rootless Docker", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootless");
    mockSpawn.mockImplementation(() => mockProcess("/home/test/.local/share/docker\n"));
    const plan = await planDamagedRepair([GHOST]);
    expect(plan.commands).toEqual([
      "systemctl --user stop docker",
      `rm -rf /home/test/.local/share/docker/containers/${GHOST}`,
      "systemctl --user start docker",
    ]);
  });

  it("uses sudo and also stops the socket for rootful Docker", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootful");
    mockSpawn.mockImplementation(() => mockProcess("/var/lib/docker\n"));
    const plan = await planDamagedRepair([GHOST]);
    expect(plan.commands).toEqual([
      "sudo systemctl stop docker docker.socket",
      `sudo rm -rf /var/lib/docker/containers/${GHOST}`,
      "sudo systemctl start docker",
    ]);
  });

  it("only puts full container IDs into rm -rf paths", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootful");
    mockSpawn.mockImplementation(() => mockProcess("/var/lib/docker\n"));
    const plan = await planDamagedRepair([GHOST, "../../etc", "abc"]);
    expect(plan.commands.filter(c => c.includes("rm -rf"))).toEqual([`sudo rm -rf /var/lib/docker/containers/${GHOST}`]);
  });

  it("refuses a data root that is not a plain absolute path", async () => {
    mockSpawn.mockImplementation(() => mockProcess("relative/docker\n"));
    await expect(planDamagedRepair([GHOST])).rejects.toThrow("Unexpected Docker data root");
  });
});

describe("runDamagedRepair", () => {
  const plan = {
    rootless: false,
    dataRoot: "/var/lib/docker",
    commands: ["sudo systemctl stop docker docker.socket", `sudo rm -rf /var/lib/docker/containers/${GHOST}`, "sudo systemctl start docker"],
  };

  it("stops Docker, removes the record and starts Docker again, as admin for rootful", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    await runDamagedRepair(plan);
    expect(mockSpawn.mock.calls.map(c => c[0])).toEqual([
      ["systemctl", "stop", "docker", "docker.socket"],
      ["rm", "-rf", `/var/lib/docker/containers/${GHOST}`],
      ["systemctl", "start", "docker"],
    ]);
    expect(mockSpawn.mock.calls.every(c => (c[1] as { superuser?: string }).superuser === "require")).toBe(true);
  });

  it("starts Docker again even when removing the record fails", async () => {
    mockSpawn.mockImplementation((args: string[]) => args[0] === "rm" ? mockProcess("", "rm: cannot remove") : mockProcess(""));
    await expect(runDamagedRepair(plan)).rejects.toThrow("cannot remove");
    const calls = mockSpawn.mock.calls.map(c => c[0]);
    expect(calls[calls.length - 1]).toEqual(["systemctl", "start", "docker"]);
  });
});
