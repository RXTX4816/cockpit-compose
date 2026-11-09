import { dockerSpawnEnviron } from "../cockpit";

export function fileFlags(configFiles: string[]): string[] {
  return configFiles.flatMap(f => ["-f", f]);
}

export interface PodmanPsContainer {
  State: string;
  Labels: Record<string, string>;
}

export interface PodmanPsForImages {
  ImageID?: string;
  Image?: string;
  Names?: string[];
}

export interface PodmanImageInspect {
  Id: string;
  RepoTags?: string[];
  Size?: number;
  Created?: string;
}

export interface PodmanVolumeJson {
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

/**
 * Runs `prepare` and then the process `start` returns, presented as that one process:
 * `stream` and `close` reach it once it exists, and `close()` during `prepare` stops it
 * from starting at all. Unlike makeFakeProcess, cancelling still works.
 */
export function afterPreparing(prepare: () => Promise<unknown>, start: () => CockpitProcess): CockpitProcess {
  const callbacks: ((d: string) => void)[] = [];
  let inner: CockpitProcess | null = null;
  let closed = false;
  let res!: (v: string) => void, rej!: (e: unknown) => void;
  const p = new Promise<string>((r, e) => { res = r; rej = e; });
  void prepare().then(() => {
    if (closed) { rej(new Error("cancelled")); return; }
    inner = start();
    inner.stream(d => { for (const cb of callbacks) cb(d); });
    inner.then(res, rej);
  }).catch(rej);
  return Object.assign(p, {
    stream(cb: (d: string) => void): CockpitProcess { callbacks.push(cb); return this as unknown as CockpitProcess; },
    close() { closed = true; inner?.close(); },
    input() {},
  }) as unknown as CockpitProcess;
}

// podman-compose (Python) is known to record whatever path was passed on the CLI in the
// com.docker.compose.project.config_files label, without resolving it to an absolute path
// (unlike docker compose / podman compose v2, which always store the resolved absolute path).
// If the stack was started from its own directory (e.g. `cd mystack && sudo podman compose up`),
// that label ends up holding a bare relative filename like "docker-compose.yml" — which then
// fails every subsequent action, since our own spawns don't share that directory as their cwd.
// The working_dir label (also standard) records the absolute directory compose was invoked
// from, so relative config_files entries are resolved against it here, once, at discovery time.
function resolveConfigFiles(rawConfigFiles: string, workingDir: string): string {
  if (!rawConfigFiles) return rawConfigFiles;
  return rawConfigFiles
    .split(",")
    .map(f => {
      const trimmed = f.trim();
      if (!trimmed || trimmed.startsWith("/") || !workingDir) return trimmed;
      return `${workingDir.replace(/\/+$/, "")}/${trimmed}`;
    })
    .join(",");
}

export function groupPodmanContainers(containers: PodmanPsContainer[]): { Name: string; Status: string; ConfigFiles: string }[] {
  const projects = new Map<string, { configFiles: string; states: string[] }>();
  for (const c of containers) {
    const name = c.Labels?.["com.docker.compose.project"] ?? "";
    if (!name) continue;
    if (!projects.has(name)) {
      const rawConfigFiles = c.Labels["com.docker.compose.project.config_files"] ?? "";
      const workingDir = c.Labels["com.docker.compose.project.working_dir"] ?? "";
      projects.set(name, {
        configFiles: resolveConfigFiles(rawConfigFiles, workingDir),
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

export { dockerSpawnEnviron };
