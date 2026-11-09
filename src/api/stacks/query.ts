import { compose, cli, getIsPodman, dockerSpawnEnviron, composeIsLimitedBackend, socketSuperuser } from "../cockpit";
import { fileFlags, makeFakeProcess, type PodmanPsContainer } from "./internal";
import { engineHttpGetJson, drainProcess } from "../engineHttp";
import { engine } from "./engine";

// podman-compose (Python) is known to record whatever path was passed on the CLI in the
// com.docker.compose.project.config_files label, without resolving it to an absolute path
// (unlike docker compose / podman compose v2, which always store the resolved absolute path).
// If the stack was started from its own directory (e.g. `cd mystack && sudo podman compose up`),
// that label ends up holding a bare relative filename like "docker-compose.yml" — which then
// fails every subsequent action, since our own spawns don't share that directory as their cwd.
// The working_dir label (also standard) records the absolute directory compose was invoked
// from, so relative config_files entries are resolved against it here, once, at discovery time.
function resolveConfigFiles(rawConfigFiles: string, workingDir: string): string {
  if (!rawConfigFiles) return rawConfigFiles;
  return rawConfigFiles
    .split(",")
    .map(f => {
      const trimmed = f.trim();
      if (!trimmed || trimmed.startsWith("/") || !workingDir) return trimmed;
      return `${workingDir.replace(/\/+$/, "")}/${trimmed}`;
    })
    .join(",");
}

export function groupPodmanContainers(containers: PodmanPsContainer[]): { Name: string; Status: string; ConfigFiles: string }[] {
  const projects = new Map<string, { configFiles: string; states: string[] }>();
  for (const c of containers) {
    const name = c.Labels?.["com.docker.compose.project"] ?? "";
    if (!name) continue;
    if (!projects.has(name)) {
      const rawConfigFiles = c.Labels["com.docker.compose.project.config_files"] ?? "";
      const workingDir = c.Labels["com.docker.compose.project.working_dir"] ?? "";
      projects.set(name, {
        configFiles: resolveConfigFiles(rawConfigFiles, workingDir),
        states: [],
      });
    }
    projects.get(name)!.states.push(c.State);
  }
  return Array.from(projects.entries()).map(([name, { configFiles, states }]) => {
    const stateCounts = new Map<string, number>();
    for (const s of states) stateCounts.set(s, (stateCounts.get(s) ?? 0) + 1);
    const status = Array.from(stateCounts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([state, count]) => `${state}(${count})`)
      .join(", ");
    return { Name: name, Status: status, ConfigFiles: configFiles };
  });
}

function listPodmanStacks(): CockpitProcess {
  const streamCallbacks: ((d: string) => void)[] = [];
  let resolveP!: (v: string) => void;
  let rejectP!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolveP = res; rejectP = rej; });

  void (async () => {
    try {
      let raw = "";
      const proc = cockpit.spawn(
        cli("ps", "--all", "--filter", "label=com.docker.compose.project", "--format", "json"),
        { superuser: socketSuperuser(), err: "message" },
      );
      proc.stream((d: string) => { raw += d; });
      await proc;
      const output = JSON.stringify(groupPodmanContainers(JSON.parse(raw) as PodmanPsContainer[]));
      for (const cb of streamCallbacks) cb(output);
      resolveP(output);
    } catch (e) {
      rejectP(e);
    }
  })();

  return Object.assign(promise, {
    stream(cb: (d: string) => void): CockpitProcess { streamCallbacks.push(cb); return this as unknown as CockpitProcess; },
    close() {},
    input() {},
  }) as unknown as CockpitProcess;
}

// Pure read, so it's tried over the engine's REST API first — same rationale as
// listContainers() in ../containers.ts. groupPodmanContainers() only needs each container's
// State and Labels, which the raw Engine API JSON already provides in matching shape, so the
// same grouping logic already proven for the podman CLI fallback works unchanged for both
// engines here. Falls back to the exact CLI behavior below on any failure.
async function listStacksHttp(): Promise<string> {
  const containers = await engineHttpGetJson<PodmanPsContainer[]>("/containers/json", {
    all: "true",
    filters: JSON.stringify({ label: ["com.docker.compose.project"] }),
  });
  return JSON.stringify(groupPodmanContainers(containers));
}

function listStacksCli(): CockpitProcess {
  if (getIsPodman()) return listPodmanStacks();
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron(),
  });
}

export function listStacks(): CockpitProcess {
  return makeFakeProcess(async () => {
    try {
      return await listStacksHttp();
    } catch {
      return await drainProcess(listStacksCli());
    }
  });
}

export async function readRunningServiceNames(project: string): Promise<string[]> {
  try {
    let raw = "";
    const proc = cockpit.spawn(
      cli("ps", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "status=running",
        "--format", `{{index .Labels "com.docker.compose.service"}}`),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream((d: string) => { raw += d; });
    await proc;
    return [...new Set(raw.split("\n").map(l => l.trim()).filter(l => l.length > 0))];
  } catch { return []; }
}

export function streamLogs(project: string, configFiles: string[], service?: string, allServices?: string[]): CockpitProcess {
  const limited = composeIsLimitedBackend();
  const tsFlag = limited ? [] : ["--timestamps"];
  const serviceArgs = service
    ? [service]
    : (limited && allServices?.length ? allServices : []);
  const base = dockerSpawnEnviron();
  const environ = getIsPodman()
    ? [...(base.environ ?? []), "PYTHONUNBUFFERED=1"]
    : base.environ;
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "logs", "--follow", "--tail", "200", ...tsFlag, ...serviceArgs),
    { superuser: socketSuperuser(), err: "out", ...(environ ? { environ } : {}) },
  );
}

export function streamEvents(project: string): CockpitProcess {
  if (composeIsLimitedBackend()) {
    return cockpit.spawn(
      cli("events", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
  }
  return cockpit.spawn(compose("-p", project, "events", "--json"), { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() });
}

export function composeTop(project: string): CockpitProcess {
  return engine().top(project);
}

export function listImages(project: string, configFiles: string[]): CockpitProcess {
  return engine().listImages(project, configFiles);
}

export function listVolumes(project: string, configFiles: string[]): CockpitProcess {
  return engine().listVolumes(project, configFiles);
}

export function composeVersion(): CockpitProcess {
  const args = composeIsLimitedBackend()
    ? compose("version")
    : compose("version", "--format", "json");
  return cockpit.spawn(args, { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() });
}

export function containerVersion(): CockpitProcess {
  return cockpit.spawn(
    cli("version", "--format", "{{.Client.Version}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listProjectContainerImageRefs(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Image}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listImagesByRepo(repo: string): CockpitProcess {
  return cockpit.spawn(
    cli("images", repo, "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listAllContainerImages(): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--format", "{{.Image}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listStoppedContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--filter", "status=exited", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Names}} — {{.Status}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listDanglingVolumes(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("volume", "ls", "--filter", "dangling=true", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export function listProjectNetworks(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

// Podman's `ps --format {{index .Labels "..."}}` Go template errors on at
// least Podman 6.0.1 ("cannot index slice/array with type string") — its ps
// JSON's Labels field doesn't round-trip through text/template indexing the
// way Docker's does. Go through --format json and read the label in JS
// instead, avoiding the template entirely (same approach already used for
// every other podman-specific fallback in this file).
function listNetworkConnectedProjectsPodman(networkName: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let raw = "";
    const proc = cockpit.spawn(
      cli("ps", "--filter", `network=${networkName}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream(d => { raw += d; });
    await proc;
    interface PsEntry { Labels?: Record<string, string> }
    const containers = JSON.parse(raw) as PsEntry[];
    return containers
      .map(c => c.Labels?.["com.docker.compose.project"] ?? "")
      .filter(Boolean)
      .join("\n");
  });
}

export function listNetworkConnectedProjects(networkName: string): CockpitProcess {
  if (getIsPodman()) return listNetworkConnectedProjectsPodman(networkName);
  return cockpit.spawn(
    cli("ps", "--filter", `network=${networkName}`, "--format", `{{.Label "com.docker.compose.project"}}`),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

export async function inspectNetworkContainerCounts(names: string[]): Promise<string> {
  if (getIsPodman()) {
    let raw = "";
    const proc = cockpit.spawn(
      cli("network", "inspect", "--format", "json", ...names),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream(d => { raw += d; });
    await proc;
    type PodmanNet = { name?: string; Name?: string; containers?: Record<string, unknown> };
    const nets = JSON.parse(raw) as PodmanNet[];
    return nets
      .map(n => `${n.name ?? n.Name ?? ""}\t${Object.keys(n.containers ?? {}).length}`)
      .join("\n");
  }
  let raw = "";
  const proc = cockpit.spawn(
    cli("network", "inspect", ...names, "--format", "{{.Name}}\t{{len .Containers}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  await proc;
  return raw;
}
