import { cli, dockerSpawnEnviron, socketSuperuser } from "../cockpit";
import { makeFakeProcess, groupPodmanContainers, type PodmanPsContainer } from "./internal";

export { groupPodmanContainers };
import { engineHttpGetJson, drainProcess } from "../engineHttp";
import { engine } from "./engine";

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
  return engine().listStacks();
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
  return engine().streamLogs(project, configFiles, service, allServices);
}

export function streamEvents(project: string): CockpitProcess {
  return engine().streamEvents(project);
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
  return engine().composeVersion();
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

export function listNetworkConnectedProjects(networkName: string): CockpitProcess {
  return engine().listNetworkConnectedProjects(networkName);
}

export async function inspectNetworkContainerCounts(names: string[]): Promise<string> {
  return engine().inspectNetworkContainerCounts(names);
}
