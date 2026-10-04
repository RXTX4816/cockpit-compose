import { load as loadYaml } from "js-yaml";
import type { ParsedPort, StackStatus } from "./types";

export function parseStackStatus(status: string): StackStatus {
  const lower = status.toLowerCase();
  const running = /\brunning\b/.test(lower);
  // A crash-looping container alternates between running and restarting: up, but not
  // healthy. Unrecognised, it made the whole stack "unknown", which dropped Stop.
  const restarting = /\brestarting\b/.test(lower);
  const paused = /\bpaused\b/.test(lower);
  // "created" was never started, e.g. left behind by an interrupted up.
  const down = /\bexit/.test(lower) || /\b(stopped|dead|created)\b/.test(lower);
  if (running && !restarting && !down) return "running";
  if (running || restarting) return "partial";
  // Paused containers next to exited ones are still in memory, so the stack is not down.
  if (paused) return down ? "partial" : "paused";
  if (down) return "stopped";
  return "unknown";
}

export function parseServiceCount(status: string): number {
  const matches = status.match(/\((\d+)\)/g);
  if (!matches) return 0;
  return matches.reduce((sum, m) => sum + parseInt(m.replace(/[()]/g, ""), 10), 0);
}

function getBindType(addr: string): ParsedPort["bindType"] {
  if (addr === "0.0.0.0" || addr === "::") return "external";
  if (addr === "127.0.0.1" || addr === "::1") return "localhost";
  return "specific";
}

const BIND_PRIORITY: Record<ParsedPort["bindType"], number> = { external: 3, specific: 2, localhost: 1 };

export function parsePortsFull(portsStr: string): ParsedPort[] {
  if (!portsStr) return [];
  const map = new Map<string, ParsedPort>();
  for (const part of portsStr.split(",")) {
    const m = part.trim().match(/^(.*):(\d+)->(\d+)\/(\w+)$/);
    if (!m) continue;
    const [, bindAddress, hostPort, containerPort, protocol] = m;
    const label = `${hostPort}→${containerPort}`;
    const bindType = getBindType(bindAddress);
    const existing = map.get(label);
    if (!existing || BIND_PRIORITY[bindType] > BIND_PRIORITY[existing.bindType]) {
      map.set(label, { label, fullLabel: `${bindAddress}:${hostPort} → ${containerPort}/${protocol}`, bindAddress, hostPort, containerPort, protocol, bindType });
    }
  }
  return [...map.values()];
}

export function parsePortsDetailed(portsStr: string): ParsedPort[] {
  if (!portsStr) return [];
  const seen = new Set<string>();
  const result: ParsedPort[] = [];
  for (const part of portsStr.split(",")) {
    const raw = part.trim();
    const m = raw.match(/^(.*):(\d+)->(\d+)\/(\w+)$/);
    if (!m || seen.has(raw)) continue;
    seen.add(raw);
    const [, bindAddress, hostPort, containerPort, protocol] = m;
    result.push({ label: `${hostPort}→${containerPort}`, fullLabel: `${bindAddress}:${hostPort} → ${containerPort}/${protocol}`, bindAddress, hostPort, containerPort, protocol, bindType: getBindType(bindAddress) });
  }
  return result;
}

export function parsePorts(portsStr: string): string[] {
  return parsePortsFull(portsStr).map(p => p.label);
}

export function getServicesFromCompose(composeContent: string): string[] {
  try {
    const compose = loadYaml(composeContent);
    if (compose && typeof compose === "object" && "services" in compose) {
      const services = (compose as Record<string, unknown>).services;
      if (typeof services === "object" && services !== null) {
        return Object.keys(services);
      }
    }
  } catch {
    // Silently fail if can't parse
  }
  return [];
}

export function getServiceProfileMapFromCompose(composeContent: string): Record<string, string[]> {
  try {
    const compose = loadYaml(composeContent);
    if (!compose || typeof compose !== "object" || !("services" in compose)) return {};
    const services = (compose as Record<string, unknown>).services;
    if (typeof services !== "object" || services === null) return {};
    const result: Record<string, string[]> = {};
    for (const [name, svc] of Object.entries(services)) {
      const p = (svc as Record<string, unknown>)?.profiles;
      if (Array.isArray(p)) {
        const profiles = p.filter((x): x is string => typeof x === "string");
        if (profiles.length > 0) result[name] = profiles;
      }
    }
    return result;
  } catch { return {}; }
}

export function getProfilesFromCompose(composeContent: string): string[] {
  try {
    const compose = loadYaml(composeContent);
    if (!compose || typeof compose !== "object") return [];
    const profiles = new Set<string>();
    // Jobs (Compose 5.6.0) carry profiles too; a profile used only by a job still has to
    // be selectable, or that job could never become active.
    for (const key of ["services", "jobs"]) {
      const entries = (compose as Record<string, unknown>)[key];
      if (typeof entries !== "object" || entries === null) continue;
      for (const entry of Object.values(entries)) {
        const p = (entry as Record<string, unknown>)?.profiles;
        if (Array.isArray(p)) p.forEach(name => { if (typeof name === "string") profiles.add(name); });
      }
    }
    return [...profiles].sort();
  } catch { return []; }
}

/** A job from the top-level `jobs:` element (Compose 5.6.0): a container run to completion. */
export interface ComposeJob {
  name: string;
  profiles: string[];
  /** False only when `triggers.manual` is explicitly false, which forbids `compose run`. */
  manual: boolean;
  /** Cron expressions, or schedule objects shown by their `cron`/`interval` field. */
  schedules: string[];
}

export function getJobsFromCompose(composeContent: string): ComposeJob[] {
  try {
    const compose = loadYaml(composeContent);
    if (!compose || typeof compose !== "object") return [];
    const jobs = (compose as Record<string, unknown>).jobs;
    if (typeof jobs !== "object" || jobs === null) return [];
    return Object.entries(jobs as Record<string, unknown>).map(([name, raw]) => {
      const job = (raw ?? {}) as Record<string, unknown>;
      const triggers = (job.triggers ?? {}) as Record<string, unknown>;
      // The spec types `manual` as boolean or string (interpolated values).
      const manual = !(triggers.manual === false || String(triggers.manual).toLowerCase() === "false");
      const schedules = Array.isArray(triggers.schedule)
        ? triggers.schedule.map(sch => {
          if (typeof sch === "string") return sch;
          const obj = (sch ?? {}) as Record<string, unknown>;
          return String(obj.cron ?? obj.interval ?? JSON.stringify(sch));
        })
        : [];
      const profiles = Array.isArray(job.profiles) ? job.profiles.filter((p): p is string => typeof p === "string") : [];
      return { name, profiles, manual, schedules };
    });
  } catch { return []; }
}

/**
 * Whether a job takes part in a run with the given profiles: a job without profiles always
 * does, one with profiles only when one of them is selected. Mirrors how Compose activates
 * services, and decides whether a scheduled job makes `up` refuse to start.
 */
export function isJobActive(job: ComposeJob, selectedProfiles: Iterable<string>): boolean {
  if (job.profiles.length === 0) return true;
  const selected = new Set(selectedProfiles);
  return job.profiles.some(p => selected.has(p));
}

export function getImagesFromCompose(composeContent: string): string[] {
  try {
    const compose = loadYaml(composeContent);
    if (!compose || typeof compose !== "object" || !("services" in compose)) return [];
    const services = (compose as Record<string, unknown>).services;
    if (typeof services !== "object" || services === null) return [];
    const images = new Set<string>();
    for (const svc of Object.values(services)) {
      const image = (svc as Record<string, unknown>)?.image;
      if (typeof image === "string" && image.trim()) images.add(image.trim());
    }
    return [...images];
  } catch { return []; }
}

export function getProjectNameFromCompose(composeContent: string): string | null {
  try {
    const compose = loadYaml(composeContent);
    if (compose && typeof compose === "object" && "name" in compose) {
      const name = (compose as Record<string, unknown>).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  } catch {
    // ignore parse errors
  }
  return null;
}

export function hasServicesKey(content: string): boolean {
  try {
    const parsed = loadYaml(content);
    return typeof parsed === "object" && parsed !== null && "services" in (parsed as Record<string, unknown>);
  } catch {
    return false;
  }
}

export function parseShortUptime(status: string): string {
  const unitMap: Record<string, string> = {
    second: "s", minute: "m", hour: "h", day: "d", week: "w", month: "mo", year: "y",
  };
  const m = status.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/i);
  if (m) return `${m[1]}${unitMap[m[2].toLowerCase()]}`;
  return status;
}

export function getComposeProjectNameFromEnv(envContent: string): string | null {
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const eqIdx = trimmed.indexOf("=");
    const key = trimmed.slice(0, eqIdx).trim();
    if (key === "COMPOSE_PROJECT_NAME") {
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      return val || null;
    }
  }
  return null;
}
