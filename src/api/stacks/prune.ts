import { cli, dockerSpawnEnviron, socketSuperuser, getIsPodman } from "../cockpit";
import { makeFakeProcess } from "./internal";

export function removeImages(ids: string[], superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("rmi", ...ids),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function listAllImages(): CockpitProcess {
  return cockpit.spawn(
    cli("images", "-a", "--no-trunc", "--format", "{{.ID}}\t{{.Repository}}:{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
}

async function fetchLines(proc: CockpitProcess): Promise<string[]> {
  let output = "";
  proc.stream((data: string) => { output += data; });
  await proc;
  return output.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

// Returns the full image ID actually backing each container on the host (running or
// stopped) — e.g. via `docker inspect`, not `docker ps --format {{.Image}}`, since the
// latter reports the *name* used to create the container, not necessarily the image
// currently on disk under that name (a re-pulled ":latest" moves the name to a new ID
// without updating already-created containers' own image reference).
export async function listInUseImageIds(): Promise<string[]> {
  const containerIds = await fetchLines(cockpit.spawn(
    cli("ps", "-a", "--format", "{{.ID}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  ));
  if (containerIds.length === 0) return [];
  return fetchLines(cockpit.spawn(
    cli("inspect", ...containerIds, "--format", "{{.Image}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  ));
}

// Runs the native "remove every image not used by any container" prune, host-wide and
// not scoped to one project. -a (not just dangling) is required to match what
// listAllImages/listInUseImageIds preview: images that still have a valid tag but are
// simply unused (e.g. every image belonging to a stack that's fully down, since no
// container then exists to keep any of that stack's images "in use") are not dangling,
// so a plain `image prune` (no -a) would silently leave them behind after the preview
// said otherwise. Delegates to the CLI's own well-tested prune rather than
// reimplementing per-ID selection/removal.
export function pruneImages(superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    cli("image", "prune", "-a", "-f"),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

// On Podman every podman-compose / `podman compose` stack's containers are members of an
// auto-created pod (`pod_<project>`), and `podman container prune` categorically skips pod
// members — it exits 0, reports nothing and removes nothing, so the whole feature was a
// silent no-op there while the preview correctly listed the containers (#274). `podman rm`
// on the very same containers works fine, so list the IDs and remove them directly.
//
// The filters deliberately match listStoppedContainers() (query.ts), which is what the
// preview shows — so what gets removed is exactly what the user was shown.
function pruneContainersPodman(project: string, superuser?: "try"): CockpitProcess {
  return makeFakeProcess(async () => {
    let raw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", "status=exited", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream(d => { raw += d; });
    await psProc;
    const ids = raw.split("\n").map(l => l.trim()).filter(Boolean);
    if (ids.length === 0) return "";
    await cockpit.spawn(cli("rm", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
    return ids.join("\n");
  });
}

export function pruneContainers(project: string, superuser?: "try"): CockpitProcess {
  if (getIsPodman()) return pruneContainersPodman(project, superuser);
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
