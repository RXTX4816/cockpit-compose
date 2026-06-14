import { compose, cli, getIsPodman, dockerSpawnEnviron } from "./cockpit";

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

export function streamLogs(project: string, service?: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "logs", "--follow", "--tail", "200", "--timestamps",
      ...(service ? [service] : [])),
    { err: "message", ...dockerSpawnEnviron() },
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
  return cockpit.spawn(
    compose(...profileFlags, "--progress", "plain", "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

export function pullStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "--progress", "plain", "-p", project, ...fileFlags(configFiles), "pull"),
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

export function listImages(project: string, configFiles: string[]): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "images", "--format", "json"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function listVolumes(project: string, configFiles: string[]): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "volumes", "--format", "json"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function streamEvents(project: string): CockpitProcess {
  return cockpit.spawn(compose("-p", project, "events", "--json"), { err: "message", ...dockerSpawnEnviron() });
}

export function composeTop(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "top"),
    { err: "message", ...dockerSpawnEnviron() },
  );
}

export function composeVersion(): CockpitProcess {
  return cockpit.spawn(
    compose("version", "--format", "json"),
    { err: "message", ...dockerSpawnEnviron() },
  );
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
  return cockpit.spawn(
    cli("ps", "--filter", `network=${networkName}`, "--format", `{{.Label "com.docker.compose.project"}}`),
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
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), ...noTtyFlag, service, ...command),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}
