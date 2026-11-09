import { compose, cli, getIsPodman, dockerSpawnEnviron, composeIsLimitedBackend, socketSuperuser } from "../cockpit";
import { fileFlags, makeFakeProcess, groupPodmanContainers, type PodmanPsContainer, type PodmanPsForImages, type PodmanImageInspect, type PodmanVolumeJson } from "./internal";

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
  /** Compose-level listing of every project, as the CLI answers it (the REST API is tried first by the caller). */
  listStacks(): CockpitProcess;
  /** A project's containers, as JSON in compose's own `ps --format json` shape. */
  listContainers(project: string): CockpitProcess;
  streamLogs(project: string, configFiles: string[], service?: string, allServices?: string[]): CockpitProcess;
  streamEvents(project: string): CockpitProcess;
  composeVersion(): CockpitProcess;
  listNetworkConnectedProjects(networkName: string): CockpitProcess;
  inspectNetworkContainerCounts(names: string[]): Promise<string>;
  containerStats(containerIds: string[]): CockpitProcess;
  /** Flags `compose up` needs on this backend. */
  upFlags: string[];
  /** Flags `compose run` needs on this backend. */
  runFlags: string[];
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

interface PodmanPort {
  host_ip?: string;
  container_port: number;
  host_port: number;
  protocol: string;
}


interface PodmanPsJson {
  Id: string;
  Names?: string[];
  Image: string;
  ImageID?: string;
  State: string;
  Status: string;
  Ports?: PodmanPort[] | null;
  Labels?: Record<string, string>;
}


function podmanPortsToString(ports: PodmanPort[] | null | undefined): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .map(p => `${p.host_ip || "0.0.0.0"}:${p.host_port}->${p.container_port}/${p.protocol}`)
    .join(", ");
}


function podmanListStacks(): CockpitProcess {
  const streamCallbacks: ((d: string) => void)[] = [];
  let resolveP!: (v: string) => void;
  let rejectP!: (e: unknown) => void;
  const promise = new Promise<string>((res, rej) => { resolveP = res; rejectP = rej; });

  void (async () => {
    try {
      let raw = "";
      const proc = cockpit.spawn(
        cli("ps", "--all", "--filter", "label=com.docker.compose.project", "--format", "json"),
        { superuser: socketSuperuser(), err: "message" },
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


// Podman's `ps --format {{index .Labels "..."}}` Go template errors on at
// least Podman 6.0.1 ("cannot index slice/array with type string") — its ps
// JSON's Labels field doesn't round-trip through text/template indexing the
// way Docker's does. Go through --format json and read the label in JS
// instead, avoiding the template entirely (same approach already used for
// every other podman-specific fallback in this file).
function podmanNetworkProjects(networkName: string): CockpitProcess {
  return makeFakeProcess(async () => {
    let raw = "";
    const proc = cockpit.spawn(
      cli("ps", "--filter", `network=${networkName}`, "--format", "json"),
      { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
    );
    proc.stream(d => { raw += d; });
    await proc;
    interface PsEntry { Labels?: Record<string, string> }
    const containers = JSON.parse(raw) as PsEntry[];
    return containers
      .map(c => c.Labels?.["com.docker.compose.project"] ?? "")
      .filter(Boolean)
      .join("\n");
  });
}


function podmanListContainers(project: string): CockpitProcess {
  const callbacks: ((d: string) => void)[] = [];
  let res!: (v: string) => void, rej!: (e: unknown) => void;
  const p = new Promise<string>((r, e) => { res = r; rej = e; });

  void (async () => {
    try {
      let raw = "";
      const proc = cockpit.spawn(
        cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
        { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
      );
      proc.stream((d: string) => { raw += d; });
      await proc;
      const allItems = JSON.parse(raw) as PodmanPsJson[];
      // Exclude one-off run containers (compose run --rm); they carry
      // com.docker.compose.oneoff=True and would inflate service replica counts.
      const items = allItems.filter(
        c => c.Labels?.["com.docker.compose.oneoff"]?.toLowerCase() !== "true",
      );
      const out = JSON.stringify(items.map(c => ({
        ID: c.Id,
        Name: c.Names?.[0] ?? "",
        Image: c.Image,
        State: c.State,
        Status: c.Status,
        Health: "",
        Ports: podmanPortsToString(c.Ports),
        Service: c.Labels?.["com.docker.compose.service"] ?? "",
      })));
      for (const cb of callbacks) cb(out);
      res(out);
    } catch (e) { rej(e); }
  })();

  return Object.assign(p, {
    stream(cb: (d: string) => void): CockpitProcess { callbacks.push(cb); return this as unknown as CockpitProcess; },
    close() {},
    input() {},
  }) as unknown as CockpitProcess;
}


function dockerPauseUnpause(action: "pause" | "unpause") {
  return (project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess =>
    cockpit.spawn(
      compose(...profiles.flatMap(p => ["--profile", p]), "-p", project, ...fileFlags(configFiles), action),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
}

const ENV = () => ({ err: "message" as const, ...dockerSpawnEnviron() });

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
    return cockpit.spawn(compose("-p", project, "top"), { superuser: socketSuperuser(), ...ENV() });
  },
  listImages(project, configFiles) {
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "images", "--format", "json"),
      { superuser: socketSuperuser(), ...ENV() },
    );
  },
  listVolumes(project, configFiles) {
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "volumes", "--format", "json"),
      { superuser: socketSuperuser(), ...ENV() },
    );
  },
  listStacks() {
    return cockpit.spawn(compose("ls", "--all", "--format", "json"), { superuser: socketSuperuser(), ...ENV() });
  },
  listContainers(project) {
    return cockpit.spawn(
      compose("-p", project, "ps", "--all", "--format", "json"),
      { superuser: socketSuperuser(), ...ENV() },
    );
  },
  streamLogs(project, configFiles, service) {
    const environ = dockerSpawnEnviron().environ;
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "logs", "--follow", "--tail", "200", "--timestamps", ...(service ? [service] : [])),
      { superuser: socketSuperuser(), err: "out", ...(environ ? { environ } : {}) },
    );
  },
  streamEvents(project) {
    return cockpit.spawn(compose("-p", project, "events", "--json"), { superuser: socketSuperuser(), ...ENV() });
  },
  composeVersion() {
    return cockpit.spawn(compose("version", "--format", "json"), { superuser: socketSuperuser(), ...ENV() });
  },
  listNetworkConnectedProjects(networkName) {
    return cockpit.spawn(
      cli("ps", "--filter", `network=${networkName}`, "--format", `{{.Label "com.docker.compose.project"}}`),
      { superuser: socketSuperuser(), ...ENV() },
    );
  },
  async inspectNetworkContainerCounts(names) {
    let raw = "";
    const proc = cockpit.spawn(
      cli("network", "inspect", ...names, "--format", "{{.Name}}\t{{len .Containers}}"),
      { superuser: socketSuperuser(), ...ENV() },
    );
    proc.stream(d => { raw += d; });
    await proc;
    return raw;
  },
  containerStats: containerStatsWith("{{.CPUPerc}}"),
  upFlags: [],
  runFlags: [],
};

function containerStatsWith(cpuField: string) {
  return (containerIds: string[]): CockpitProcess => cockpit.spawn(
    cli("stats", "--no-stream",
      "--format",
      `{"id":"{{.ID}}","name":"{{.Name}}","cpu":"${cpuField}","mem":"{{.MemUsage}}","memPerc":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}"}`,
      ...containerIds,
    ),
    { superuser: socketSuperuser(), ...ENV() },
  );
}

// Podman with a compose that speaks the Docker CLI (`podman compose` v2): the compose-level
// commands match Docker's, the container-level ones go through the Podman CLI.
const podman: EngineOps = {
  ...docker,
  pause: (project, _files, _profiles, superuser) => podmanPauseUnpause(project, "pause", superuser),
  unpause: (project, _files, _profiles, superuser) => podmanPauseUnpause(project, "unpause", superuser),
  pruneContainers: podmanPruneContainers,
  top: podmanTop,
  listStacks: podmanListStacks,
  streamLogs(project, configFiles, service) {
    const environ = [...(dockerSpawnEnviron().environ ?? []), "PYTHONUNBUFFERED=1"];
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "logs", "--follow", "--tail", "200", "--timestamps", ...(service ? [service] : [])),
      { superuser: socketSuperuser(), err: "out", environ },
    );
  },
  listNetworkConnectedProjects: podmanNetworkProjects,
  async inspectNetworkContainerCounts(names) {
    let raw = "";
    const proc = cockpit.spawn(
      cli("network", "inspect", "--format", "json", ...names),
      { superuser: socketSuperuser(), ...ENV() },
    );
    proc.stream(d => { raw += d; });
    await proc;
    type PodmanNet = { name?: string; Name?: string; containers?: Record<string, unknown> };
    const nets = JSON.parse(raw) as PodmanNet[];
    return nets
      .map(n => `${n.name ?? n.Name ?? ""}\t${Object.keys(n.containers ?? {}).length}`)
      .join("\n");
  },
  containerStats: containerStatsWith("{{.CPU}}"),
  runFlags: ["-T"],
};

// Podman with podman-compose (Python), which lacks `--format json` on ps/images, the
// `volumes` command, `--timestamps`, `events --json` and the scale flags.
const podmanCompose: EngineOps = {
  ...podman,
  scale: podmanScale,
  listImages: project => podmanListImages(project),
  listVolumes: project => podmanListVolumes(project),
  listContainers: podmanListContainers,
  streamLogs(project, configFiles, service, allServices) {
    const serviceArgs = service ? [service] : (allServices?.length ? allServices : []);
    const environ = [...(dockerSpawnEnviron().environ ?? []), "PYTHONUNBUFFERED=1"];
    return cockpit.spawn(
      compose("-p", project, ...fileFlags(configFiles), "logs", "--follow", "--tail", "200", ...serviceArgs),
      { superuser: socketSuperuser(), err: "out", environ },
    );
  },
  streamEvents(project) {
    return cockpit.spawn(
      cli("events", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser: socketSuperuser(), ...ENV() },
    );
  },
  composeVersion() {
    return cockpit.spawn(compose("version"), { superuser: socketSuperuser(), ...ENV() });
  },
  upFlags: ["--force-recreate"],
};

/** The variant of every operation for the current Runtime and Compose backend. */
export function engine(): EngineOps {
  if (!getIsPodman()) return docker;
  return composeIsLimitedBackend() ? podmanCompose : podman;
}
