import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { listContainers, getContainerStats } from "./containers";

beforeEach(() => { mockSpawn.mockReset(); vi.resetModules(); });

describe("listContainers [docker]", () => {
  it("spawns compose ps --all --format json for the project", () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    listContainers("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("ps");
    expect(args).toContain("--all");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });
});

describe("listContainers [podman-compose limited backend]", () => {
  it("falls back to podman ps --filter label when compose is limited backend", async () => {
    mockSpawn.mockImplementation(() => mockProcess(JSON.stringify([
      {
        Id: "abc123def456",
        Names: ["rdtclient"],
        Image: "docker.io/ghcr.io/rdtclient:latest",
        State: "running",
        Status: "Up 5 minutes",
        Ports: [{ host_ip: "0.0.0.0", container_port: 6500, host_port: 6500, protocol: "tcp" }],
        Labels: { "com.docker.compose.service": "rdtclient", "com.docker.compose.project": "rdtclient" },
        ImageID: "sha256:deadbeef",
      },
    ])));

    const { listContainers: lc } = await import("./containers");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    // Simulate detection having run and determined limited backend (no --progress support)
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);

    let received = "";
    const proc = lc("rdtclient");
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { ID: string; Name: string; Service: string; Ports: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].ID).toBe("abc123def456");
    expect(result[0].Name).toBe("rdtclient");
    expect(result[0].Service).toBe("rdtclient");
    expect(result[0].Ports).toBe("0.0.0.0:6500->6500/tcp");

    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args).toContain("-a");
    expect(args).toContain("label=com.docker.compose.project=rdtclient");
    expect(args).not.toContain("compose");
  });
});

describe("listContainers [podman error handling]", () => {
  it("rejects when podman ps throws in limited backend mode", async () => {
    const { listContainers: lc } = await import("./containers");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);
    mockSpawn.mockImplementation(() => mockProcess("", "connection refused"));
    await expect(lc("myapp")).rejects.toThrow();
  });
});

describe("getContainerStats", () => {
  it("spawns docker stats --no-stream with the given container IDs", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    getContainerStats(["abc123", "def456"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("docker");
    expect(args).toContain("stats");
    expect(args).toContain("--no-stream");
    expect(args).toContain("abc123");
    expect(args).toContain("def456");
  });

  it("includes a JSON format template in the args", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    getContainerStats(["abc"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const formatArg = args.find(a => a.includes("{{.CPUPerc}}"));
    expect(formatArg).toBeDefined();
  });
});
