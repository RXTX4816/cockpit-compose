import { cli, dockerSpawnEnviron } from "../cockpit";

export function removeImages(ids: string[], superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("rmi", ...ids),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
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
