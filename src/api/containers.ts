import { engineHttpGetJson, drainProcess } from "./engineHttp";
import {
  type EngineContainerJson, type EngineContainerStatsJson,
  engineContainerName, enginePortsToString, isOneoffContainer,
  engineCpuPercent, engineMemoryUsageBytes,
} from "./engineJson";
import { makeFakeProcess } from "./stacks/internal";
import { engine } from "./stacks/engine";

// Pure read, so it's tried over the engine's REST API first — skips the per-poll cost of
// spawning a whole new process (and, for compose specifically, a Python interpreter) just to
// list containers that already exist. Falls back to the exact CLI behavior below on any
// failure (old engine version, socket unavailable, unexpected response), so this can never be
// less reliable than the CLI path — only sometimes faster.
async function listContainersHttp(project: string): Promise<string> {
  const items = await engineHttpGetJson<EngineContainerJson[]>("/containers/json", {
    all: "true",
    filters: JSON.stringify({ label: [`com.docker.compose.project=${project}`] }),
  });
  // Exclude one-off run containers (compose run --rm); they carry
  // com.docker.compose.oneoff=True and would inflate service replica counts.
  const filtered = items.filter(c => !isOneoffContainer(c));
  return JSON.stringify(filtered.map(c => ({
    ID: c.Id,
    Name: engineContainerName(c),
    Image: c.Image,
    State: c.State,
    Status: c.Status,
    Health: "",
    Ports: enginePortsToString(c.Ports),
    Service: c.Labels?.["com.docker.compose.service"] ?? "",
  })));
}

function listContainersCli(project: string): CockpitProcess {
  return engine().listContainers(project);
}

export function listContainers(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    try {
      return await listContainersHttp(project);
    } catch {
      return await drainProcess(listContainersCli(project));
    }
  });
}

// Pure read, tried over the engine's REST API first — same rationale as listContainers().
// Unlike the CLI's `docker stats id1 id2 ...` (one call for every container), the Engine API
// has no batch form: one GET /containers/{id}/stats per container, run in parallel. That's
// still a clear win here since process-spawn overhead — not the number of HTTP round trips —
// dominates the cost on constrained hardware. Any single container's stats failing to parse
// (or the whole batch failing) falls back to the exact previous CLI behavior.
async function getContainerStatsHttp(containerIds: string[]): Promise<string> {
  const results = await Promise.all(containerIds.map(async id => {
    const s = await engineHttpGetJson<EngineContainerStatsJson>(`/containers/${id}/stats`, { stream: "false" });
    const cpuPercent = engineCpuPercent(s);
    const usage = engineMemoryUsageBytes(s);
    const limit = s.memory_stats.limit ?? 0;
    return {
      id,
      name: (s.name ?? "").replace(/^\//, ""),
      cpu: `${cpuPercent.toFixed(2)}%`,
      mem: `${usage}B / ${limit}B`,
      memPerc: limit > 0 ? `${((usage / limit) * 100).toFixed(2)}%` : "0.00%",
      net: "",
      block: "",
    };
  }));
  return JSON.stringify(results);
}

function getContainerStatsCli(containerIds: string[]): CockpitProcess {
  return engine().containerStats(containerIds);
}

export function getContainerStats(containerIds: string[]): CockpitProcess {
  return makeFakeProcess(async () => {
    try {
      return await getContainerStatsHttp(containerIds);
    } catch {
      return await drainProcess(getContainerStatsCli(containerIds));
    }
  });
}
