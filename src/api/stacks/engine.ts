import { compose, cli, getIsPodman, dockerSpawnEnviron, composeIsLimitedBackend, socketSuperuser } from "../cockpit";
import { fileFlags, makeFakeProcess, type PodmanPsForImages, type PodmanImageInspect, type PodmanVolumeJson } from "./internal";

// The operations whose commands differ between Docker and Podman. Each variant is written
// out here once, and `engine()` is the only place that decides which one applies, so the
// callers (and the public lifecycle, prune and query functions) contain no Runtime check.

export interface EngineOps {
  pause(project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess;
  unpause(project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess;
  scale(project: string, configFiles: string[], scales: Record<string, number>, profiles: string[], superuser?: "try"): CockpitProcess;
  pruneContainers(project: string, superuser?: "try"): CockpitProcess;
  top(project: string): CockpitProcess;
  listImages(project: string, configFiles: string[]): CockpitProcess;
  listVolumes(project: string, configFiles: string[]): CockpitProcess;
}

function podmanPauseUnpause(project: string, action: "pause" | "unpause", superuser?: "try"): CockpitProcess {
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

function podmanScale(
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
        { superuser, err: "message", ...dockerSpawnEnviron() },
      );
      psProc.stream(d => { psRaw += d; });
      await psProc;

      interface PsEntry { Id: string; Names?: string[] }
      const containers = JSON.parse(psRaw) as PsEntry[];
      if (containers.length <= targetCount) continue;

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

// On Podman every podman-compose / `podman compose` stack's containers are members of an
// auto-created pod (`pod_<project>`), and `podman container prune` categorically skips pod
// members — it exits 0, reports nothing and removes nothing, so the whole feature was a
// silent no-op there while the preview correctly listed the containers (#274). `podman rm`
// on the very same containers works fine, so list the IDs and remove them directly.
//
// The filters deliberately match listStoppedContainers() (query.ts), which is what the
// preview shows — so what gets removed is exactly what the user was shown.
function podmanPruneContainers(project: string, superuser?: "try"): CockpitProcess {
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

function podmanTop(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
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
      const topProc = cockpit.spawn(cli("top", c.Id), { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() });
      topProc.stream((d: string) => { topRaw += d; });
      try {
        await topProc;
        sections.push(service + "\n" + topRaw.trimEnd());
      } catch { /* container not running */ }
    }
    return sections.join("\n\n");
  });
}

function podmanListImages(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
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
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
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

function podmanListVolumes(project: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let raw = "";
    const proc = cockpit.spawn(
      cli("volume", "ls", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream((d: string) => { raw += d; });
    await proc;
    const volumes = JSON.parse(raw) as PodmanVolumeJson[];
    return JSON.stringify(volumes.map(v => ({ Name: v.Name, Driver: v.Driver, Mountpoint: v.Mountpoint })));
  });
}

function dockerPauseUnpause(action: "pause" | "unpause") {
  return (project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess =>
    cockpit.spawn(
      compose(...profiles.flatMap(p => ["--profile", p]), "-p", project, ...fileFlags(configFiles), action),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
}

const docker: EngineOps = {
  pause: dockerPauseUnpause("pause"),
  unpause: dockerPauseUnpause("unpause"),
  scale(project, configFiles, scales, profiles, superuser) {
    const profileFlags = profiles.flatMap(p => ["--profile", p]);
    const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
    return cockpit.spawn(
      compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", ...scaleFlags),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
  },
  pruneContainers(project, superuser) {
    return cockpit.spawn(
      cli("container", "prune", "-f", "--filter", `label=com.docker.compose.project=${project}`),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
  },
  top(project) {
    return cockpit.spawn(compose("-p", project, "top"), { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() });
  },
  listImages(project, configFiles) {
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "images", "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
  },
  listVolumes(project, configFiles) {
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "volumes", "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
  },
};

const podman: EngineOps = {
  pause: (project, _files, _profiles, superuser) => podmanPauseUnpause(project, "pause", superuser),
  unpause: (project, _files, _profiles, superuser) => podmanPauseUnpause(project, "unpause", superuser),
  scale: podmanScale,
  pruneContainers: podmanPruneContainers,
  top: podmanTop,
  listImages: project => podmanListImages(project),
  listVolumes: project => podmanListVolumes(project),
};

/**
 * The variant of each operation for the current Runtime. Pause, prune and top follow the
 * engine; Scale, images and volumes follow the Compose backend, which on Podman can be a
 * podman-compose that lacks `--format json`, `volumes` and the scale flags.
 */
export function engine(): EngineOps {
  const onPodman = getIsPodman();
  const limited = composeIsLimitedBackend();
  const byEngine = onPodman ? podman : docker;
  const byBackend = limited ? podman : docker;
  return {
    pause: byEngine.pause,
    unpause: byEngine.unpause,
    pruneContainers: byEngine.pruneContainers,
    top: byEngine.top,
    scale: byBackend.scale,
    listImages: byBackend.listImages,
    listVolumes: byBackend.listVolumes,
  };
}
