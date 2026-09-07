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
// (cpu_delta / system_delta) * number_of_cpus * 100. Throws on a degenerate sample (e.g.
// system_delta <= 0, which can happen on the very first sample after a container starts, or
// if a runtime's compat stats endpoint doesn't populate these fields the way Docker's does)
// rather than returning a nonsensical percentage — callers fall back to the CLI in that case.
export function engineCpuPercent(s: EngineContainerStatsJson): number {
  const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage;
  const systemDelta = (s.cpu_stats.system_cpu_usage ?? 0) - (s.precpu_stats.system_cpu_usage ?? 0);
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
