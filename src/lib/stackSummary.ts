import { parsePortsFull } from "../api/parsing";
import type { ComposeContainer, ContainerStats, ParsedPort } from "../api/types";
import { parseDockerBytes } from "./bytes";

const BIND_PRIORITY: Record<ParsedPort["bindType"], number> = { external: 3, specific: 2, localhost: 1 };

/** The ports a stack publishes (each once, on its widest bind) and the ids of its running containers. */
export function summarizePorts(containers: ComposeContainer[]): { ports: ParsedPort[]; runningIds: string[] } {
  const portMap = new Map<string, ParsedPort>();
  const runningIds: string[] = [];
  for (const c of containers) {
    for (const p of parsePortsFull(c.Ports)) {
      const existing = portMap.get(p.label);
      if (!existing || BIND_PRIORITY[p.bindType] > BIND_PRIORITY[existing.bindType]) portMap.set(p.label, p);
    }
    if (c.State?.toLowerCase() === "running" && c.ID) runningIds.push(c.ID);
  }
  return { ports: [...portMap.values()], runningIds };
}

/** Total CPU percentage and used memory in bytes, or null when there are no samples. */
export function sumStats(samples: ContainerStats[]): { cpu: number; mem: number } | null {
  if (samples.length === 0) return null;
  let cpu = 0;
  let mem = 0;
  for (const s of samples) {
    cpu += parseFloat(s.cpu || "0");
    const [used] = (s.mem || "0B / 0B").split(" / ");
    mem += parseDockerBytes(used);
  }
  return { cpu, mem };
}

/** Containers listed under their compose project, in the order they came. */
export function groupByProject(items: { project: string; container: ComposeContainer }[]): Map<string, ComposeContainer[]> {
  const out = new Map<string, ComposeContainer[]>();
  for (const { project, container } of items) {
    const list = out.get(project);
    if (list) list.push(container);
    else out.set(project, [container]);
  }
  return out;
}
