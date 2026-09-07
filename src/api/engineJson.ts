// Shapes and helpers for the raw JSON returned by the Docker/Podman Engine REST API
// (GET /containers/json), as opposed to the CLI's own `--format json` output — the two use
// different field names and structure for the same data (e.g. `Id` vs `ID`, ports as
// structured objects vs a pre-formatted string), so responses from the HTTP path are
// converted to match what the existing CLI-based code already produces.

export interface EngineContainerPort {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface EngineContainerJson {
  Id: string;
  Names?: string[];
  Image: string;
  State: string;
  Status: string;
  Ports?: EngineContainerPort[];
  Labels?: Record<string, string>;
}

export function engineContainerName(c: EngineContainerJson): string {
  return (c.Names?.[0] ?? "").replace(/^\//, "");
}

// Matches the CLI's Ports column: only published (host-mapped) ports are shown, not every
// port the image merely EXPOSEs.
export function enginePortsToString(ports: EngineContainerPort[] | undefined): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .filter(p => p.PublicPort !== undefined)
    .map(p => `${p.IP || "0.0.0.0"}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`)
    .join(", ");
}

export function isOneoffContainer(c: EngineContainerJson): boolean {
  return c.Labels?.["com.docker.compose.oneoff"]?.toLowerCase() === "true";
}

// Shape of GET /containers/{id}/stats?stream=false. `precpu_stats` is a second, slightly
// earlier CPU sample the daemon already takes internally even for a single non-streaming
// response — that's what makes a CPU percentage computable from one HTTP call, matching what
// `docker stats --no-stream` shows from one CLI invocation.
export interface EngineContainerStatsJson {
  id?: string;
  name?: string;
  cpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
    online_cpus?: number;
    percpu_usage?: number[];
  };
  precpu_stats: {
    cpu_usage: { total_usage: number };
    system_cpu_usage?: number;
  };
  memory_stats: {
    usage?: number;
    limit?: number;
    stats?: { cache?: number };
  };
}

// Docker's own CPU% formula (matches what `docker stats`/`CLI --format {{.CPUPerc}}` shows):
// (cpu_delta / system_delta) * number_of_cpus * 100. This only works when precpu_stats is a
// real, slightly-earlier second sample — true for Docker's own daemon, confirmed *not* true
// for Podman's compat endpoint: verified live against a real podman.sock that `precpu_stats`
// always comes back as total_usage=0 with system_cpu_usage omitted entirely, never an actual
// second sample, however long the container has been running. Silently plugging that into the
// formula wouldn't crash — cpu_stats.system_cpu_usage alone is still a valid, non-zero number
// — it would just quietly compute the wrong thing: cumulative average CPU use since container
// start, not the current instantaneous CPU%. So precpu_stats.system_cpu_usage being absent is
// treated as a hard signal this sample can't yield a real percentage, same as a non-positive
// delta — callers fall back to the CLI in both cases, which is correct for Podman.
export function engineCpuPercent(s: EngineContainerStatsJson): number {
  if (s.precpu_stats.system_cpu_usage === undefined) {
    throw new Error("engineCpuPercent: precpu_stats has no system_cpu_usage — not a real second sample");
  }
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (s.cpu_stats.system_cpu_usage ?? 0) - s.precpu_stats.system_cpu_usage;
  if (systemDelta <= 0 || cpuDelta < 0) {
    throw new Error("engineCpuPercent: degenerate stats sample (no usable delta)");
  }
  const cpuCount = s.cpu_stats.online_cpus ?? s.cpu_stats.percpu_usage?.length ?? 1;
  return (cpuDelta / systemDelta) * cpuCount * 100;
}

// Memory "usage" in Docker's stats includes page cache, which `docker stats` itself subtracts
// out for a more meaningful figure — matches what the CLI's {{.MemUsage}} column shows.
export function engineMemoryUsageBytes(s: EngineContainerStatsJson): number {
  const usage = s.memory_stats.usage ?? 0;
  const cache = s.memory_stats.stats?.cache ?? 0;
  return Math.max(0, usage - cache);
}
