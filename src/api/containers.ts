import { compose, cli, getIsPodman, dockerSpawnEnviron, composeIsLimitedBackend, socketSuperuser } from "./cockpit";
import { engineHttpGetJson, drainProcess } from "./engineHttp";
import { type EngineContainerJson, engineContainerName, enginePortsToString, isOneoffContainer } from "./engineJson";
import { makeFakeProcess } from "./stacks/internal";

interface PodmanPort {
  host_ip?: string;
  container_port: number;
  host_port: number;
  protocol: string;
}

interface PodmanPsJson {
  Id: string;
  Names?: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Status: string;
  Ports?: PodmanPort[] | null;
  Labels?: Record<string, string>;
}

function podmanPortsToString(ports: PodmanPort[] | null | undefined): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .map(p => `${p.host_ip || "0.0.0.0"}:${p.host_port}->${p.container_port}/${p.protocol}`)
    .join(", ");
}

function listContainersPodmanFallback(project: string): CockpitProcess {
  const callbacks: ((d: string) => void)[] = [];
  let res!: (v: string) => void, rej!: (e: unknown) => void;
  const p = new Promise<string>((r, e) => { res = r; rej = e; });

  void (async () => {
    try {
      let raw = "";
      const proc = cockpit.spawn(
        cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
        { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
      );
      proc.stream((d: string) => { raw += d; });
      await proc;
      const allItems = JSON.parse(raw) as PodmanPsJson[];
      // Exclude one-off run containers (compose run --rm); they carry
      // com.docker.compose.oneoff=True and would inflate service replica counts.
      const items = allItems.filter(
        c => c.Labels?.["com.docker.compose.oneoff"]?.toLowerCase() !== "true",
      );
      const out = JSON.stringify(items.map(c => ({
        ID: c.Id,
        Name: c.Names?.[0] ?? "",
        Image: c.Image,
        State: c.State,
        Status: c.Status,
        Health: "",
        Ports: podmanPortsToString(c.Ports),
        Service: c.Labels?.["com.docker.compose.service"] ?? "",
      })));
      for (const cb of callbacks) cb(out);
      res(out);
    } catch (e) { rej(e); }
  })();

  return Object.assign(p, {
    stream(cb: (d: string) => void): CockpitProcess { callbacks.push(cb); return this as unknown as CockpitProcess; },
    close() {},
    input() {},
  }) as unknown as CockpitProcess;
}

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
  if (composeIsLimitedBackend()) return listContainersPodmanFallback(project);
  return cockpit.spawn(
    compose("-p", project, "ps", "--all", "--format", "json"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
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

export function getContainerStats(containerIds: string[]): CockpitProcess {
  const cpuField = getIsPodman() ? "{{.CPU}}" : "{{.CPUPerc}}";
  return cockpit.spawn(
    cli("stats", "--no-stream",
      "--format",
      `{"id":"{{.ID}}","name":"{{.Name}}","cpu":"${cpuField}","mem":"{{.MemUsage}}","memPerc":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}"}`,
      ...containerIds,
    ),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}
