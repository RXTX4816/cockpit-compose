import { compose } from "./cockpit";

export function listStacks(): CockpitProcess {
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    err: "message",
  });
}

export function startStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "up", "-d"),
    { superuser: "try", err: "message" },
  );
}

export function stopStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "stop"),
    { superuser: "try", err: "message" },
  );
}

export function restartStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "restart"),
    { superuser: "try", err: "message" },
  );
}

export function streamLogs(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "logs", "--follow", "--tail", "200", "--timestamps"),
    { err: "message" },
  );
}

export function downStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "down"),
    { superuser: "try", err: "message" },
  );
}

export function pullStack(project: string, configFile: string): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, "-f", configFile, "pull"),
    { superuser: "try", err: "out" },
  );
}

export function pauseStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "pause"),
    { superuser: "try", err: "message" },
  );
}

export function unpauseStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "unpause"),
    { superuser: "try", err: "message" },
  );
}

export function killStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "kill"),
    { superuser: "try", err: "message" },
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

export function listDanglingImages(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "images", "--filter", "dangling=true", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Repository}}:{{.Tag}} ({{.Size}})"],
    { err: "message" },
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

export function pruneImages(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "image", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser: "try", err: "message" },
  );
}

export function pruneContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "container", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser: "try", err: "message" },
  );
}

export function pruneVolumes(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "volume", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser: "try", err: "message" },
  );
}

export function pruneNetworks(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "network", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`],
    { superuser: "try", err: "message" },
  );
}
