import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import * as cockpitMod from "../cockpit";
import { setRuntime } from "../cockpit";
import { engine } from "./engine";

// engine() is the one place the Runtime decides between variants; the behaviour of each
// variant is covered per operation in lifecycle.test.ts, prune.test.ts and query.test.ts.

const files = ["/srv/a/compose.yml"];
const verbOf = (i = 0) => mockSpawn.mock.calls[i][0] as string[];

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockImplementation(() => mockProcess("[]"));
});

describe("engine()", () => {
  it("on Docker runs compose directly", () => {
    setRuntime("docker");
    engine().pause("p", files, ["dev"], "try");
    expect(verbOf()).toEqual(["docker", "compose", "--profile", "dev", "-p", "p", "-f", files[0], "pause"]);
    mockSpawn.mockClear();
    engine().pruneContainers("p");
    expect(verbOf().slice(0, 3)).toEqual(["docker", "container", "prune"]);
  });

  it("on Podman pauses and prunes through the container CLI, project by label", async () => {
    setRuntime("podman");
    await engine().pause("p", files, [], "try");
    expect(verbOf()).toEqual(expect.arrayContaining(["podman", "ps", "--filter", "label=com.docker.compose.project=p"]));
    mockSpawn.mockClear();
    await engine().pruneContainers("p");
    expect(verbOf()).toEqual(expect.arrayContaining(["status=exited"]));
    expect(verbOf()).not.toContain("prune");
  });
});

afterEach(() => vi.restoreAllMocks());

describe("the three variants", () => {
  const variant = (podman: boolean, limited: boolean) => {
    vi.spyOn(cockpitMod, "getIsPodman").mockReturnValue(podman);
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(limited);
    return engine();
  };

  it("Docker logs with timestamps and no Python buffering variable", () => {
    variant(false, false).streamLogs("p", files);
    const [argv, opts] = mockSpawn.mock.calls[0] as [string[], { environ?: string[] }];
    expect(argv).toContain("--timestamps");
    expect(opts.environ ?? []).not.toContain("PYTHONUNBUFFERED=1");
  });

  it("Podman with Docker-style compose keeps timestamps and unbuffers Python output", () => {
    variant(true, false).streamLogs("p", files);
    const [argv, opts] = mockSpawn.mock.calls[0] as [string[], { environ?: string[] }];
    expect(argv).toContain("--timestamps");
    expect(opts.environ).toContain("PYTHONUNBUFFERED=1");
  });

  it("podman-compose drops timestamps, names the services itself and uses the container CLI for events", () => {
    const ops = variant(true, true);
    ops.streamLogs("p", files, undefined, ["web", "db"]);
    const argv = mockSpawn.mock.calls[0][0] as string[];
    expect(argv).not.toContain("--timestamps");
    expect(argv.slice(-2)).toEqual(["web", "db"]);
    mockSpawn.mockClear();
    ops.streamEvents("p");
    expect(mockSpawn.mock.calls[0][0]).toEqual(expect.arrayContaining(["podman", "events", "--filter"]));
    mockSpawn.mockClear();
    ops.composeVersion();
    expect(mockSpawn.mock.calls[0][0]).not.toContain("--format");
  });

  it("flags: only podman-compose forces recreation, only Podman disables the TTY for run", () => {
    expect(variant(false, false)).toMatchObject({ upFlags: [], runFlags: [] });
    expect(variant(true, false)).toMatchObject({ upFlags: [], runFlags: ["-T"] });
    expect(variant(true, true)).toMatchObject({ upFlags: ["--force-recreate"], runFlags: ["-T"] });
  });

  it("stats read the CPU column under its Podman name only on Podman", () => {
    variant(false, false).containerStats(["a"]);
    expect((mockSpawn.mock.calls[0][0] as string[]).join(" ")).toContain("{{.CPUPerc}}");
    mockSpawn.mockClear();
    variant(true, false).containerStats(["a"]);
    expect((mockSpawn.mock.calls[0][0] as string[]).join(" ")).toContain("{{.CPU}}");
  });
});
