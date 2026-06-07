import { compose } from "./cockpit";

function fileFlags(configFiles: string[]): string[] {
  return configFiles.flatMap(f => ["-f", f]);
}

export function listStacks(): CockpitProcess {
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    err: "message",
  });
}

export function startStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "message" },
  );
}

export function stopStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop"),
    { superuser, err: "message" },
  );
}

export function restartStack(project: string, configFiles: string[], profiles: string[] = [], services: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "restart", ...services),
    { superuser, err: "message" },
  );
}

// Returns deduplicated service names for containers currently in "running" state.
export async function readRunningServiceNames(project: string): Promise<string[]> {
  try {
    let raw = "";
    const proc = cockpit.spawn(
      ["docker", "ps", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "status=running",
        "--format", `{{index .Labels "com.docker.compose.service"}}`],
      { err: "message" },
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
    { err: "message" },
  );
}

export function downStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "down"),
    { superuser, err: "message" },
  );
}

export function upStackStream(project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr into the streamable stdout so the log viewer gets all output
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "--progress", "plain", "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "out" },
  );
}

export function pullStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "--progress", "plain", "-p", project, ...fileFlags(configFiles), "pull"),
    { superuser, err: "out" },
  );
}

export function pauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "pause"),
    { superuser, err: "message" },
  );
}

export function unpauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "unpause"),
    { superuser, err: "message" },
  );
}

export function killStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "kill"),
    { superuser, err: "message" },
  );
}

export function listImages(project: string, configFiles: string[]): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "images", "--format", "json"),
    { err: "message" },
  );
}

export function listVolumes(project: string, configFiles: string[]): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, ...fileFlags(configFiles), "volumes", "--format", "json"),
    { err: "message" },
  );
}

export function streamEvents(project: string): CockpitProcess {
  return cockpit.spawn(compose("-p", project, "events", "--json"), { err: "message" });
}

export function composeTop(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "top"),
    { err: "message" },
  );
}

export function composeVersion(): CockpitProcess {
  return cockpit.spawn(
    compose("version", "--format", "json"),
    { err: "message" },
  );
}

// Returns image refs (e.g. "docker.gitea.com/gitea:1.26.2") for all containers
// belonging to the project, running or stopped.
export function listProjectContainerImageRefs(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Image}}"],
    { err: "message" },
  );
}

// Returns lines of "<repo>:<tag>\t<size>" for every image matching the repo.
export function listImagesByRepo(repo: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "images", repo, "--format", "{{.Repository}}:{{.Tag}}\t{{.Size}}"],
    { err: "message" },
  );
}

// Returns image names for every container on the host (running + stopped).
// Uses {{.Image}} instead of {{.ImageID}} — the latter is unavailable on older Docker / Podman.
export function listAllContainerImages(): CockpitProcess {
  return cockpit.spawn(
    ["docker", "ps", "-a", "--format", "{{.Image}}"],
    { err: "message" },
  );
}

export function removeImages(ids: string[], superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["docker", "rmi", ...ids],
    { superuser, err: "message" },
  );
}

export function listStoppedContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "ps", "-a", "--filter", "status=exited", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Names}} — {{.Status}}"],
    { err: "message" },
  );
}

export function listDanglingVolumes(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "volume", "ls", "--filter", "dangling=true", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"],
    { err: "message" },
  );
}

export function listProjectNetworks(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "network", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Name}}"],
    { err: "message" },
  );
}

// Returns one compose project name per line for every running container attached to the given network.
// Non-Compose containers emit an empty string for the label; callers must filter those out.
export function listNetworkConnectedProjects(networkName: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "ps", "--filter", `network=${networkName}`, "--format", `{{.Label "com.docker.compose.project"}}`],
    { err: "message" },
  );
}

// Returns lines of "<name>\t<container-count>" for each of the given networks.
export function inspectNetworkContainerCounts(names: string[]): CockpitProcess {
  return cockpit.spawn(
    ["docker", "network", "inspect", ...names, "--format", "{{.Name}}\t{{len .Containers}}"],
    { err: "message" },
  );
}



export function pruneContainers(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["docker", "container", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser, err: "message" },
  );
}

export function pruneVolumes(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["docker", "volume", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser, err: "message" },
  );
}

export function pruneNetworks(project: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["docker", "network", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser, err: "message" },
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
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), service, ...command),
    { superuser, err: "out" },
  );
}
