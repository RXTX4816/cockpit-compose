import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resetHost } from "@rxtx4816/cockpit-plugin-base-react/host";
import { installFakeHost, type FakeHost } from "@rxtx4816/cockpit-plugin-base-react/testing/host";
import * as cockpitMod from "../cockpit";
import { setRuntime } from "../cockpit";
import { findStackLeftovers, planDamagedRepair, renderRepairCommands, runDamagedRepair } from "./leftovers";

const GOOD = "a".repeat(64);
const GHOST = "b".repeat(64);

let host: FakeHost;

beforeEach(() => {
  host = installFakeHost();
  setRuntime("docker");
});
afterEach(() => {
  resetHost();
  vi.restoreAllMocks();
});

describe("findStackLeftovers", () => {
  it("reports nothing when Docker lists no containers for the project", async () => {
    host.onRun(["docker", "ps"], "");
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [], damaged: [] });
  });

  // The signature of a damaged record: ps -a lists it, inspect cannot find it.
  it("flags IDs Docker lists but cannot inspect as damaged", async () => {
    host.onRun(["docker", "ps"], `${GOOD}\n${GHOST}\n`);
    host.onRun(["docker", "inspect"], ({ argv }) => {
      if (argv.includes(GHOST)) throw new Error(`Error: No such object: ${GHOST}`);
      return GOOD;
    });
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [GOOD, GHOST], damaged: [GHOST] });
    const psCall = host.commands.find(c => c.startsWith("docker ps"))!;
    expect(psCall).toContain("--no-trunc");
    expect(psCall).toContain("label=com.docker.compose.project=gotify");
  });

  it("does not treat other inspect failures as damage", async () => {
    host.onRun(["docker", "ps"], `${GOOD}\n`);
    host.onRun(["docker", "inspect"], () => { throw new Error("permission denied while trying to connect to the Docker daemon socket"); });
    expect((await findStackLeftovers("gotify")).damaged).toEqual([]);
  });

  it("never flags damage on Podman, where the repair does not apply", async () => {
    setRuntime("podman");
    host.onRun(["podman", "ps"], `${GHOST}\n`);
    host.onRun(["podman", "inspect"], () => { throw new Error("no such object"); });
    expect(await findStackLeftovers("gotify")).toEqual({ ids: [GHOST], damaged: [] });
  });
});

describe("planDamagedRepair", () => {
  it("uses systemctl --user and the rootless data root for rootless Docker", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootless");
    host.onRun(["docker", "info"], "/home/test/.local/share/docker\n");
    const plan = await planDamagedRepair([GHOST]);
    expect(plan).toEqual({ rootless: true, dataRoot: "/home/test/.local/share/docker", containerIds: [GHOST] });
    expect(renderRepairCommands(plan)).toEqual([
      "systemctl --user stop docker",
      `rm -rf /home/test/.local/share/docker/containers/${GHOST}`,
      "systemctl --user start docker",
    ]);
  });

  it("uses sudo and also stops the socket for rootful Docker", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootful");
    host.onRun(["docker", "info"], "/var/lib/docker\n");
    const plan = await planDamagedRepair([GHOST]);
    expect(plan).toEqual({ rootless: false, dataRoot: "/var/lib/docker", containerIds: [GHOST] });
    expect(renderRepairCommands(plan)).toEqual([
      "sudo systemctl stop docker docker.socket",
      `sudo rm -rf /var/lib/docker/containers/${GHOST}`,
      "sudo systemctl start docker",
    ]);
  });

  it("only puts full container IDs into rm -rf paths", async () => {
    vi.spyOn(cockpitMod, "getSocketMode").mockReturnValue("rootful");
    host.onRun(["docker", "info"], "/var/lib/docker\n");
    const plan = await planDamagedRepair([GHOST, "../../etc", "abc"]);
    expect(plan.containerIds).toEqual([GHOST]);
    expect(renderRepairCommands(plan).filter(c => c.includes("rm -rf"))).toEqual([`sudo rm -rf /var/lib/docker/containers/${GHOST}`]);
  });

  it("refuses a data root that is not a plain absolute path", async () => {
    host.onRun(["docker", "info"], "relative/docker\n");
    await expect(planDamagedRepair([GHOST])).rejects.toThrow("Unexpected Docker data root");
  });
});

describe("runDamagedRepair", () => {
  const plan = {
    rootless: false,
    dataRoot: "/var/lib/docker",
    containerIds: [GHOST],
  };

  it("stops Docker, removes the record and starts Docker again, as admin for rootful", async () => {
    host.onRun(["systemctl"], "");
    host.onRun(["rm"], "");
    await runDamagedRepair(plan);
    expect(host.commands).toEqual([
      "systemctl stop docker docker.socket",
      `rm -rf /var/lib/docker/containers/${GHOST}`,
      "systemctl start docker",
    ]);
    expect(host.calls.filter(c => c.kind === "run").every(c => c.superuser === "require")).toBe(true);
  });

  it("starts Docker again even when removing the record fails", async () => {
    host.onRun(["systemctl"], "");
    host.onRun(["rm"], () => { throw new Error("rm: cannot remove"); });
    await expect(runDamagedRepair(plan)).rejects.toThrow("cannot remove");
    expect(host.commands[host.commands.length - 1]).toBe("systemctl start docker");
  });
});
