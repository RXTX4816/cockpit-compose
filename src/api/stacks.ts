import { compose, cli, getIsPodman, dockerSpawnEnviron, composeSupportsProgress, composeIsLimitedBackend } from "./cockpit";

function fileFlags(configFiles: string[]): string[] {
  return configFiles.flatMap(f => ["-f", f]);
}

interface PodmanPsContainer {
  State: string;
  Labels: Record<string, string>;
}

export function groupPodmanContainers(containers: PodmanPsContainer[]): { Name: string; Status: string; ConfigFiles: string }[] {
  const projects = new Map<string, { configFiles: string; states: string[] }>();
  for (const c of containers) {
    const name = c.Labels?.["com.docker.compose.project"] ?? "";
    if (!name) continue;
    if (!projects.has(name)) {
      projects.set(name, {
        configFiles: c.Labels["com.docker.compose.project.config_files"] ?? "",
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
        { err: "message" },
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

export function listStacks(): CockpitProcess {
  if (getIsPodman()) return listPodmanStacks();
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    err: "message", ...dockerSpawnEnviron(),
  });
}

export function startStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function stopStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function restartStack(project: string, configFiles: string[], profiles: string[] = [], services: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "restart", ...services),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns deduplicated service names for containers currently in "running" state.
export async function readRunningServiceNames(project: string): Promise<string[]> {
  try {
    let raw = "";
    const proc = cockpit.spawn(
      cli("ps", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "status=running",
        "--format", `{{index .Labels "com.docker.compose.service"}}`),
      { err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream((d: string) => { raw += d; });
    await proc;
    return [...new Set(raw.split("\n").map(l => l.trim()).filter(l => l.length > 0))];
  } catch { return []; }
}

export function streamLogs(project: string, configFiles: string[], service?: string, allServices?: string[]): CockpitProcess {
  const limited = composeIsLimitedBackend();
  // podman-compose doesn't support --timestamps
  const tsFlag = limited ? [] : ["--timestamps"];
  // podman-compose doesn't reliably stream logs without explicit service names;
  // pass the full list when no single service is selected
  const serviceArgs = service
    ? [service]
    : (limited && allServices?.length ? allServices : []);
  const base = dockerSpawnEnviron();
  // podman-compose is a Python script; when its stdout is piped (not a TTY) Python
  // block-buffers output at 8 KB. Small containers like gotify never fill that buffer,
  // so log lines never reach the UI. PYTHONUNBUFFERED=1 disables the buffer.
  // We set it whenever using Podman because `podman compose` may delegate to the
  // Python tool and the env var propagates through to the subprocess.
  const environ = getIsPodman()
    ? [...(base.environ ?? []), "PYTHONUNBUFFERED=1"]
    : base.environ;
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "logs", "--follow", "--tail", "200", ...tsFlag, ...serviceArgs),
    // err:"out" captures stderr too (external provider warnings, podman-compose output)
    { err: "out", ...(environ ? { environ } : {}) },
  );
}

export function downStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "down"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function upStackStream(project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr into the streamable stdout so the log viewer gets all output
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  // podman-compose errors on existing containers ("name already in use"); --force-recreate handles it
  const forceRecreate = composeIsLimitedBackend() ? ["--force-recreate"] : [];
  return cockpit.spawn(
    compose(...profileFlags, ...progressFlag, "-p", project, ...fileFlags(configFiles), "up", "-d", ...forceRecreate),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

export function pullStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  return cockpit.spawn(
    compose(...profileFlags, ...progressFlag, "-p", project, ...fileFlags(configFiles), "pull"),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

export function pauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "pause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function unpauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "unpause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function killStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "kill"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

// ── podman-compose fallbacks ─────────────────────────────────────────────────
// podman-compose (standalone Python) lacks --format json on images and has no
// `volumes` subcommand. When it is the active backend, query the Podman CLI directly.

interface PodmanPsForImages {
  ImageID?: string;
  Image?: string;
  Names?: string[];
}

interface PodmanImageInspect {
  Id: string;
  RepoTags?: string[];
  Size?: number;
  Created?: string;
}

interface PodmanVolumeJson {
  Name: string;
  Driver: string;
  Mountpoint: string;
}

function makeFakeProcess(work: () => Promise<string>): CockpitProcess {
  const callbacks: ((d: string) => void)[] = [];
  let res!: (v: string) => void, rej!: (e: unknown) => void;
  const p = new Promise<string>((r, e) => { res = r; rej = e; });
  void work().then(out => { for (const cb of callbacks) cb(out); res(out); }).catch(rej);
  return Object.assign(p, {
    stream(cb: (d: string) => void): CockpitProcess { callbacks.push(cb); return this as unknown as CockpitProcess; },
    close() {},
    input() {},
  }) as unknown as CockpitProcess;
}

function listImagesPodmanFallback(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream((d: string) => { psRaw += d; });
    await psProc;

    const containers = JSON.parse(psRaw) as PodmanPsForImages[];
    if (containers.length === 0) return "[]";

    const seenIds = new Set<string>();
    const imageIds: string[] = [];
    const containerByImageId = new Map<string, string>();
    for (const c of containers) {
      const id = c.ImageID ?? "";
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        imageIds.push(id);
        containerByImageId.set(id, c.Names?.[0] ?? "");
      }
    }

    let inspRaw = "";
    const inspProc = cockpit.spawn(
      cli("image", "inspect", "--format", "json", ...imageIds),
      { err: "message", ...dockerSpawnEnviron() },
    );
    inspProc.stream((d: string) => { inspRaw += d; });
    await inspProc;

    const images = JSON.parse(inspRaw) as PodmanImageInspect[];
    return JSON.stringify(images.map(img => {
      const repoTag = img.RepoTags?.[0] ?? "<none>:<none>";
      const colonIdx = repoTag.lastIndexOf(":");
      const repo = colonIdx > 0 ? repoTag.slice(0, colonIdx) : repoTag;
      const tag = colonIdx > 0 ? repoTag.slice(colonIdx + 1) : "<none>";
      return {
        ID: img.Id.replace(/^sha256:/, "").slice(0, 12),
        Repository: repo,
        Tag: tag,
        Size: img.Size ?? 0,
        CreatedAt: img.Created ?? "",
        ContainerName: containerByImageId.get(img.Id) ?? "",
      };
    }));
  });
}

function listVolumesPodmanFallback(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let raw = "";
    const proc = cockpit.spawn(
      cli("volume", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream((d: string) => { raw += d; });
    await proc;
    const volumes = JSON.parse(raw) as PodmanVolumeJson[];
    return JSON.stringify(volumes.map(v => ({ Name: v.Name, Driver: v.Driver, Mountpoint: v.Mountpoint })));
  });
}

export function listImages(project: string, configFiles: string[]): CockpitProcess {
  if (composeIsLimitedBackend()) return listImagesPodmanFallback(project);
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "images", "--format", "json"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function listVolumes(project: string, configFiles: string[]): CockpitProcess {
  if (composeIsLimitedBackend()) return listVolumesPodmanFallback(project);
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "volumes", "--format", "json"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function streamEvents(project: string): CockpitProcess {
  if (composeIsLimitedBackend()) {
    return cockpit.spawn(
      cli("events", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { err: "message", ...dockerSpawnEnviron() },
    );
  }
  return cockpit.spawn(compose("-p", project, "events", "--json"), { err: "message", ...dockerSpawnEnviron() });
}

export function composeTop(project: string): CockpitProcess {
  if (composeIsLimitedBackend()) return composeTopPodmanFallback(project);
  return cockpit.spawn(
    compose("-p", project, "top"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

function composeTopPodmanFallback(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream((d: string) => { psRaw += d; });
    await psProc;

    interface PsEntry { Id: string; Names?: string[]; Labels?: Record<string, string>; }
    const containers = JSON.parse(psRaw) as PsEntry[];
    if (containers.length === 0) return "";

    const sections: string[] = [];
    for (const c of containers) {
      const service = c.Labels?.["com.docker.compose.service"] ?? c.Names?.[0] ?? c.Id.slice(0, 12);
      let topRaw = "";
      const topProc = cockpit.spawn(cli("top", c.Id), { err: "message", ...dockerSpawnEnviron() });
      topProc.stream((d: string) => { topRaw += d; });
      try {
        await topProc;
        sections.push(service + "\n" + topRaw.trimEnd());
      } catch { /* container not running */ }
    }
    return sections.join("\n\n");
  });
}

export function composeVersion(): CockpitProcess {
  // podman-compose (limited backend) doesn't accept --format json on its version subcommand;
  // omit the flag and let the caller extract the version from plain text.
  const args = composeIsLimitedBackend()
    ? compose("version")
    : compose("version", "--format", "json");
  return cockpit.spawn(args, { err: "message", ...dockerSpawnEnviron() });
}

export function containerVersion(): CockpitProcess {
  return cockpit.spawn(
    cli("version", "--format", "{{.Client.Version}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns image refs (e.g. "docker.gitea.com/gitea:1.26.2") for all containers
// belonging to the project, running or stopped.
export function listProjectContainerImageRefs(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Image}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns lines of "<repo>:<tag>\t<size>" for every image matching the repo.
export function listImagesByRepo(repo: string): CockpitProcess {
  return cockpit.spawn(
    cli("images", repo, "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns image names for every container on the host (running + stopped).
// Uses {{.Image}} instead of {{.ImageID}} — the latter is unavailable on older Docker / Podman.
export function listAllContainerImages(): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--format", "{{.Image}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function removeImages(ids: string[], superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("rmi", ...ids),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function listStoppedContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("ps", "-a", "--filter", "status=exited", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Names}} — {{.Status}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function listDanglingVolumes(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("volume", "ls", "--filter", "dangling=true", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function listProjectNetworks(project: string): CockpitProcess {
  return cockpit.spawn(
    cli("network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns one compose project name per line for every running container attached to the given network.
// Non-Compose containers emit an empty string for the label; callers must filter those out.
export function listNetworkConnectedProjects(networkName: string): CockpitProcess {
  // Podman uses {{index .Labels "key"}}; Docker uses {{.Label "key"}}
  const labelTpl = getIsPodman()
    ? `{{index .Labels "com.docker.compose.project"}}`
    : `{{.Label "com.docker.compose.project"}}`;
  return cockpit.spawn(
    cli("ps", "--filter", `network=${networkName}`, "--format", labelTpl),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

// Returns lines of "<name>\t<container-count>" for each of the given networks.
// Podman's network inspect JSON uses a "containers" object; Docker uses a Go template.
export async function inspectNetworkContainerCounts(names: string[]): Promise<string> {
  if (getIsPodman()) {
    let raw = "";
    const proc = cockpit.spawn(
      cli("network", "inspect", "--format", "json", ...names),
      { err: "message", ...dockerSpawnEnviron() },
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
    { err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  await proc;
  return raw;
}



export function pruneContainers(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("container", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function pruneVolumes(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("volume", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function pruneNetworks(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("network", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function scaleStack(
  project: string,
  configFiles: string[],
  scales: Record<string, number>,
  profiles: string[] = [],
  superuser?: "try",
): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", ...scaleFlags),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function composeRunStream(
  project: string,
  configFiles: string[],
  service: string,
  command: string[],
  rm: boolean,
  superuser?: "try",
): CockpitProcess {
  // Podman Compose run may garble output without -T when no PTY is allocated
  const noTtyFlag = getIsPodman() ? ["-T"] : [];
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  return cockpit.spawn(
    compose(...progressFlag, "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), ...noTtyFlag, service, ...command),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}
