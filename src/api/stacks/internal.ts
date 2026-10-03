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

export { dockerSpawnEnviron };
