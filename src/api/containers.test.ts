import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn, mockHttp } from "../test/setup";
import { mockProcess, mockHttpClient } from "../test/helpers";
import { listContainers, getContainerStats } from "./containers";

beforeEach(() => { mockSpawn.mockReset(); mockHttp.mockReset(); vi.resetModules(); });

describe("listContainers [engine HTTP API]", () => {
  it("uses the HTTP path when the engine socket is available, skipping the CLI entirely", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/json": JSON.stringify([
        {
          Id: "abc123",
          Names: ["/myapp_web_1"],
          Image: "nginx",
          State: "running",
          Status: "Up 5 minutes",
          Ports: [{ IP: "0.0.0.0", PrivatePort: 80, PublicPort: 8080, Type: "tcp" }],
          Labels: { "com.docker.compose.service": "web", "com.docker.compose.project": "myapp" },
        },
      ]),
    }));

    const { listContainers: lc } = await import("./containers");
    let received = "";
    const proc = lc("myapp");
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { ID: string; Name: string; Service: string; Ports: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].ID).toBe("abc123");
    expect(result[0].Name).toBe("myapp_web_1");
    expect(result[0].Service).toBe("web");
    expect(result[0].Ports).toBe("0.0.0.0:8080->80/tcp");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("excludes one-off containers and omits unpublished ports over the HTTP path", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/json": JSON.stringify([
        { Id: "c1", Image: "busybox", State: "exited", Status: "Exited", Labels: { "com.docker.compose.oneoff": "true", "com.docker.compose.project": "myapp" } },
        { Id: "c2", Image: "nginx", State: "running", Status: "Up", Ports: [{ PrivatePort: 80, Type: "tcp" }], Labels: { "com.docker.compose.project": "myapp" } },
      ]),
    }));

    const { listContainers: lc } = await import("./containers");
    let received = "";
    const proc = lc("myapp");
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { ID: string; Ports: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].ID).toBe("c2");
    expect(result[0].Ports).toBe("");
  });

  it("falls back to the CLI when the HTTP request fails", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    const failingClient = mockHttpClient();
    vi.spyOn(failingClient, "get").mockRejectedValue(new Error("connection refused"));
    mockHttp.mockReturnValue(failingClient);
    mockSpawn.mockImplementation(() => mockProcess("[]"));

    const { listContainers: lc } = await import("./containers");
    const proc = lc("myapp");
    await proc;

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});

describe("getContainerStats [engine HTTP API]", () => {
  const statsFor = (overrides: { totalUsage: number; preTotalUsage: number; systemUsage: number; preSystemUsage: number; onlineCpus: number; usage: number; cache: number; limit: number }) => JSON.stringify({
    name: "/myapp_web_1",
    cpu_stats: { cpu_usage: { total_usage: overrides.totalUsage }, system_cpu_usage: overrides.systemUsage, online_cpus: overrides.onlineCpus },
    precpu_stats: { cpu_usage: { total_usage: overrides.preTotalUsage }, system_cpu_usage: overrides.preSystemUsage },
    memory_stats: { usage: overrides.usage, limit: overrides.limit, stats: { cache: overrides.cache } },
  });

  it("computes CPU% and memory usage from the raw stats sample, skipping the CLI entirely", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/abc123/stats": statsFor({
        totalUsage: 300000000, preTotalUsage: 100000000, // 200ms cpu delta
        systemUsage: 2000000000, preSystemUsage: 1000000000, // 1s system delta
        onlineCpus: 2,
        usage: 104857600, cache: 4857600, limit: 1073741824, // 100MiB used, 1GiB limit
      }),
    }));

    const { getContainerStats: stats } = await import("./containers");
    let received = "";
    const proc = stats(["abc123"]);
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { id: string; name: string; cpu: string; mem: string; memPerc: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("abc123");
    expect(result[0].name).toBe("myapp_web_1");
    // (200ms / 1000ms) * 2 cpus * 100 = 40%
    expect(result[0].cpu).toBe("40.00%");
    // 104857600 - 4857600 = 100000000 bytes used
    expect(result[0].mem).toBe("100000000B / 1073741824B");
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("fetches each container's stats independently in parallel", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/c1/stats": statsFor({ totalUsage: 200000000, preTotalUsage: 100000000, systemUsage: 2000000000, preSystemUsage: 1000000000, onlineCpus: 1, usage: 1000, cache: 0, limit: 2000 }),
      "/containers/c2/stats": statsFor({ totalUsage: 400000000, preTotalUsage: 100000000, systemUsage: 2000000000, preSystemUsage: 1000000000, onlineCpus: 1, usage: 500, cache: 0, limit: 2000 }),
    }));

    const { getContainerStats: stats } = await import("./containers");
    let received = "";
    const proc = stats(["c1", "c2"]);
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { id: string }[];
    expect(result.map(r => r.id)).toEqual(["c1", "c2"]);
  });

  it("falls back to the CLI when a stats sample can't yield a usable CPU delta", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    // system_cpu_usage delta is zero — a degenerate sample that can't produce a percentage.
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/abc123/stats": statsFor({ totalUsage: 100, preTotalUsage: 0, systemUsage: 1000, preSystemUsage: 1000, onlineCpus: 1, usage: 0, cache: 0, limit: 0 }),
    }));
    mockSpawn.mockImplementation(() => mockProcess("[]"));

    const { getContainerStats: stats } = await import("./containers");
    const proc = stats(["abc123"]);
    await proc;

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("falls back to the CLI for Podman's real stats shape, not a wrong CPU% (verified live against a real podman.sock)", async () => {
    // Podman's compat /containers/{id}/stats?stream=false does NOT provide a real second CPU
    // sample the way Docker's does — precpu_stats always comes back with total_usage: 0 and no
    // system_cpu_usage key at all, confirmed by sampling a real running container 3 times, 2s
    // apart, over a live podman.sock. Plugging that into the delta formula wouldn't throw
    // (cpu_stats.system_cpu_usage alone is a valid positive number) — it would silently
    // compute cumulative average CPU since container start, not current CPU%. This must fall
    // back to the CLI instead of returning that wrong number.
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "getIsPodman").mockReturnValue(true);
    vi.spyOn(cockpitMod, "getPodmanSocketPath").mockReturnValue("unix:///run/user/1000/podman/podman.sock");
    mockHttp.mockReturnValue(mockHttpClient({
      "/containers/abc123/stats": JSON.stringify({
        name: "long-logs_web_1",
        cpu_stats: { cpu_usage: { total_usage: 1343621000 }, system_cpu_usage: 17315571000 },
        precpu_stats: { cpu_usage: { total_usage: 0 } }, // no system_cpu_usage key — real podman shape
        memory_stats: { usage: 25436160, limit: 1007079424 }, // no stats.cache key — also real podman shape
      }),
    }));
    mockSpawn.mockImplementation(() => mockProcess("[]"));

    const { getContainerStats: stats } = await import("./containers");
    const proc = stats(["abc123"]);
    await proc;

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("falls back to the CLI when the HTTP request fails outright", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "getDockerSocketPath").mockReturnValue("unix:///var/run/docker.sock");
    const failingClient = mockHttpClient();
    vi.spyOn(failingClient, "get").mockRejectedValue(new Error("connection refused"));
    mockHttp.mockReturnValue(failingClient);
    mockSpawn.mockImplementation(() => mockProcess("[]"));

    const { getContainerStats: stats } = await import("./containers");
    const proc = stats(["abc123"]);
    await proc;

    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});

describe("listContainers [docker]", () => {
  it("spawns compose ps --all --format json for the project", async () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    // listContainers() tries the engine HTTP API first (mocked to fail by default in this
    // suite — see test/setup.ts), then falls back to the CLI spawn asserted on below; that
    // fallback happens asynchronously, so the spawn call must be awaited before inspecting it.
    await listContainers("myapp").catch(() => {});
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
  it("spawns docker stats --no-stream with the given container IDs", async () => {
    // getContainerStats() tries the engine HTTP API first (mocked to fail by default — see
    // test/setup.ts), then falls back to the CLI spawn asserted on below, asynchronously.
    mockSpawn.mockImplementation(() => mockProcess(""));
    await getContainerStats(["abc123", "def456"]).catch(() => {});
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("docker");
    expect(args).toContain("stats");
    expect(args).toContain("--no-stream");
    expect(args).toContain("abc123");
    expect(args).toContain("def456");
  });

  it("includes a JSON format template in the args", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    await getContainerStats(["abc"]).catch(() => {});
    const args = mockSpawn.mock.calls[0][0] as string[];
    const formatArg = args.find(a => a.includes("{{.CPUPerc}}"));
    expect(formatArg).toBeDefined();
  });

  it("uses podman's {{.CPU}} field instead of {{.CPUPerc}} in podman mode", async () => {
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    const { getContainerStats: stats } = await import("./containers");
    mockSpawn.mockImplementation(() => mockProcess(""));
    await stats(["abc"]).catch(() => {});
    const args = mockSpawn.mock.calls[0][0] as string[];
    const formatArg = args.find(a => a.includes("{{.CPU}}"));
    expect(formatArg).toBeDefined();
    expect(args.find(a => a.includes("{{.CPUPerc}}"))).toBeUndefined();
  });
});

describe("listContainers [podman ports/oneoff edge cases]", () => {
  it("excludes one-off run containers (com.docker.compose.oneoff=True)", async () => {
    const { listContainers: lc } = await import("./containers");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);
    // Lazy: proc must be created at spawn-call time (not now), so its data-delivery microtask
    // fires after proc.stream() is registered below — listContainers() now takes an extra
    // async hop (the HTTP attempt) before reaching this CLI spawn, so an eagerly-created
    // mockProcess would already have resolved with no stream callback registered yet.
    mockSpawn.mockImplementation(() => mockProcess(JSON.stringify([
      { Id: "c1", Image: "busybox", State: "exited", Status: "Exited", Labels: { "com.docker.compose.oneoff": "True", "com.docker.compose.project": "myapp" } },
      { Id: "c2", Image: "nginx", State: "running", Status: "Up", Labels: { "com.docker.compose.project": "myapp" } },
    ])));
    let received = "";
    const proc = lc("myapp");
    proc.stream(d => { received += d; });
    await proc;
    const result = JSON.parse(received) as { ID: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].ID).toBe("c2");
  });

  it("renders an empty Ports string when no ports are published", async () => {
    const { listContainers: lc } = await import("./containers");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);
    mockSpawn.mockImplementation(() => mockProcess(JSON.stringify([
      { Id: "c1", Image: "busybox", State: "running", Status: "Up", Ports: null, Labels: {} },
    ])));
    let received = "";
    const proc = lc("myapp");
    proc.stream(d => { received += d; });
    await proc;
    const result = JSON.parse(received) as { Ports: string }[];
    expect(result[0].Ports).toBe("");
  });
});

// Regression: these three spawns had no superuser escalation at all — for a rootful
// Podman/Docker socket, that meant the service/container list and stats always ran
// unescalated, silently seeing nothing (or the wrong, rootless-only data) regardless
// of which socket mode was actually selected. This is what made a rootful stack look
// "running" at the stack-summary level (which was already escalation-aware) while its
// service/container list and Stack Info modal showed stale/empty data.
describe("superuser escalation (rootful Podman)", () => {
  beforeEach(async () => {
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    // containers.ts calls socketSuperuser() via its import binding (a real cross-module
    // call, unlike isRootlessMode()'s intra-file use inside socketSuperuser itself) — so
    // this spy is what actually takes effect here.
    vi.spyOn(cockpitMod, "socketSuperuser").mockReturnValue("try");
  });

  it("listContainers passes superuser:'try' for the compose-backed path", async () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    await listContainers("myapp").catch(() => {});
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });

  it("listContainers passes superuser:'try' for the limited-backend (podman ps) fallback", async () => {
    const cockpitMod = await import("./cockpit");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);
    mockSpawn.mockReturnValue(mockProcess("[]"));
    const proc = listContainers("myapp");
    await proc.catch(() => {});
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });

  it("getContainerStats passes superuser:'try'", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    await getContainerStats(["abc123"]).catch(() => {});
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});
