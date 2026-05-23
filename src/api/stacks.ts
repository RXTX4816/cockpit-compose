import { compose } from "./cockpit";

export function listStacks(): CockpitProcess {
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    err: "message",
  });
}

export function startStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "up", "-d"),
    { superuser, err: "message" },
  );
}

export function stopStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "stop"),
    { superuser, err: "message" },
  );
}

export function restartStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "restart"),
    { superuser, err: "message" },
  );
}

export function streamLogs(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "logs", "--follow", "--tail", "200", "--timestamps"),
    { err: "message" },
  );
}

export function downStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "down"),
    { superuser, err: "message" },
  );
}

export function upStackStream(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr into the streamable stdout so the log viewer gets all output
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, "-f", configFile, "up", "-d"),
    { superuser, err: "out" },
  );
}

export function pullStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, "-f", configFile, "pull"),
    { superuser, err: "out" },
  );
}

export function pauseStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "pause"),
    { superuser, err: "message" },
  );
}

export function unpauseStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "unpause"),
    { superuser, err: "message" },
  );
}

export function killStack(project: string, configFile: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "kill"),
    { superuser, err: "message" },
  );
}

export function listImages(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "images", "--format", "json"),
    { err: "message" },
  );
}

export function listVolumes(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "volumes", "--format", "json"),
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
