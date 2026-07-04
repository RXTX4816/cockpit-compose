import { compose, cli, getIsPodman, dockerSpawnEnviron, composeSupportsProgress, composeIsLimitedBackend } from "./cockpit";

function fileFlags(configFiles: string[]): string[] {
  return configFiles.flatMap(f => ["-f", f]);
}

export interface PodmanPsContainer {
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

export function listPodmanStacks(): CockpitProcess {
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

export function startService(project: string, configFiles: string[], serviceName: string, profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", serviceName),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function stopService(project: string, configFiles: string[], serviceName: string, profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop", serviceName),
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

export function pauseUnpausePodmanFallback(project: string, action: "pause" | "unpause", superuser?: "try"): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream((d: string) => { psRaw += d; });
    await psProc;
    interface PsEntry { Id: string; }
    const containers = JSON.parse(psRaw) as PsEntry[];
    if (!Array.isArray(containers) || containers.length === 0) return "";
    const ids = containers.map(c => c.Id);
    let out = "";
    const proc = cockpit.spawn(cli(action, ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
    proc.stream((d: string) => { out += d; });
    try {
      await proc;
    } catch (e: unknown) {
      if (String(e).includes("cgroup")) {
        throw new Error("Pause is not supported on this system. Enable cgroup v2 delegation for rootless Podman (see /etc/systemd/system/user@.service.d/).");
      }
      throw e;
    }
    return out;
  });
}

export function pauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  if (getIsPodman()) return pauseUnpausePodmanFallback(project, "pause", superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "pause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function unpauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  if (getIsPodman()) return pauseUnpausePodmanFallback(project, "unpause", superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "unpause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

// Kills the stack and force-removes every container carrying the project label,
// including one-off run containers that compose kill ignores.
export function killStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  return makeFakeProcess(async () => {
    const profileFlags = profiles.flatMap(p => ["--profile", p]);
    // Best-effort compose kill — may not know about one-off containers; ignore errors.
    try {
      await cockpit.spawn(
        compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "kill"),
        { superuser, err: "message", ...dockerSpawnEnviron() },
      );
    } catch { /* compose kill failing (e.g. no running services) is not fatal */ }

    // Force-remove every container still carrying the project label.
    let raw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream(d => { raw += d; });
    await psProc;
    const ids = raw.split("\n").map(l => l.trim()).filter(Boolean);
    if (ids.length === 0) return "";
    await cockpit.spawn(cli("rm", "-f", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
    return "";
  });
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

export function makeFakeProcess(work: () => Promise<string>): CockpitProcess {
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
  if (getIsPodman()) return composeTopPodmanFallback(project);
  return cockpit.spawn(
    compose("-p", project, "top"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function composeTopPodmanFallback(project: string): CockpitProcess {
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
  if (composeIsLimitedBackend()) return scaleStackPodmanFallback(project, configFiles, scales, profiles, superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", ...scaleFlags),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

// podman-compose up --scale handles scale-up but silently ignores scale-down (excess containers
// remain running). After the up command, query each service and stop+rm any extras.
function scaleStackPodmanFallback(
  project: string,
  configFiles: string[],
  scales: Record<string, number>,
  profiles: string[] = [],
  superuser?: "try",
): CockpitProcess {
  return makeFakeProcess(async () => {
    const profileFlags = profiles.flatMap(p => ["--profile", p]);
    const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
    let out = "";
    const upProc = cockpit.spawn(
      compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", "--force-recreate", ...scaleFlags),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    upProc.stream(d => { out += d; });
    await upProc;

    for (const [svc, targetCount] of Object.entries(scales)) {
      let psRaw = "";
      const psProc = cockpit.spawn(
        cli("ps", "-a",
          "--filter", `label=com.docker.compose.project=${project}`,
          "--filter", `label=com.docker.compose.service=${svc}`,
          "--format", "json"),
        { err: "message", ...dockerSpawnEnviron() },
      );
      psProc.stream(d => { psRaw += d; });
      await psProc;

      interface PsEntry { Id: string; Names?: string[] }
      const containers = JSON.parse(psRaw) as PsEntry[];
      if (containers.length <= targetCount) continue;

      // Sort by trailing numeric index in name (project_service_N) so we remove highest-index first
      containers.sort((a, b) => {
        const idx = (c: PsEntry) => { const m = (c.Names?.[0] ?? "").match(/_(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
        return idx(b) - idx(a);
      });
      const excess = containers.slice(0, containers.length - targetCount).map(c => c.Id);
      await cockpit.spawn(cli("stop", ...excess), { superuser, err: "message", ...dockerSpawnEnviron() });
      await cockpit.spawn(cli("rm", ...excess), { superuser, err: "message", ...dockerSpawnEnviron() });
    }

    return out;
  });
}

// Force-removes any one-off containers (started by compose run) still running for a project.
// Used when the one-off container is stuck — e.g. a service with no overriding command that
// keeps running indefinitely. Queries by the com.docker.compose.oneoff=True label so it only
// touches run containers, never the project's regular service containers.
// Snapshot all container IDs currently running for a project.
// Call this before compose run starts; pass the result to forceRemoveOneoffContainers
// so it can diff and only remove the containers that appeared after the run began.
export async function snapshotProjectContainerIds(project: string): Promise<Set<string>> {
  let raw = "";
  const proc = cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  try { await proc; } catch { return new Set(); }
  return new Set(raw.split("\n").map(l => l.trim()).filter(Boolean));
}

// Force-removes containers that appeared AFTER the pre-run snapshot was taken.
// This is backend-agnostic: it doesn't rely on the com.docker.compose.oneoff label
// (which docker-compose sets but podman-compose omits) or any naming convention.
export async function forceRemoveOneoffContainers(
  project: string,
  preRunIds: Set<string>,
  superuser?: "try",
): Promise<void> {
  let raw = "";
  const proc = cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  await proc;
  const ids = raw.split("\n").map(l => l.trim()).filter(id => id && !preRunIds.has(id));
  if (ids.length === 0) return;
  await cockpit.spawn(cli("rm", "-f", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
}

export type RunCommand =
  | { mode: "args"; command: string[] }
  | { mode: "override"; command: string[] };

export function composeRunStream(
  project: string,
  configFiles: string[],
  service: string,
  command: RunCommand,
  rm: boolean,
  superuser?: "try",
): CockpitProcess {
  // Podman Compose run may garble output without -T when no PTY is allocated
  const noTtyFlag = getIsPodman() ? ["-T"] : [];
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  // "args" (default) appends the typed tokens as CMD arguments to the image's own
  // ENTRYPOINT — this is what makes e.g. typing just "--help" work. "override" instead
  // replaces the entrypoint with the command's own first token (e.g. a full binary
  // path, as in a real terminal `exec`), so it runs directly instead of being appended
  // after the existing entrypoint. Deliberately does NOT shell out via `sh -c`: many
  // minimal/distroless images have no shell binary at all, which would otherwise fail
  // with "exec: sh: executable file not found in $PATH".
  const entrypointFlag = command.mode === "override" ? ["--entrypoint", command.command[0]] : [];
  const commandArgs = command.mode === "override" ? command.command.slice(1) : command.command;
  return cockpit.spawn(
    compose(...progressFlag, "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), ...noTtyFlag, ...entrypointFlag, service, ...commandArgs),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}
