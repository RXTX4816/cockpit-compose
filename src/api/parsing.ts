import { load as loadYaml } from "js-yaml";
import type { ParsedPort, StackStatus } from "./types";

export function parseStackStatus(status: string): StackStatus {
  const lower = status.toLowerCase();
  if (lower.includes("paused") && !lower.includes("running") && !lower.includes("exit")) return "paused";
  const hasRunning = lower.includes("running");
  const hasExited = lower.includes("exit") || lower.includes("stopped");
  if (hasRunning && !hasExited) return "running";
  if (hasRunning && hasExited) return "partial";
  if (!hasRunning && hasExited) return "stopped";
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
    if (!compose || typeof compose !== "object" || !("services" in compose)) return [];
    const services = (compose as Record<string, unknown>).services;
    if (typeof services !== "object" || services === null) return [];
    const profiles = new Set<string>();
    for (const svc of Object.values(services)) {
      const p = (svc as Record<string, unknown>)?.profiles;
      if (Array.isArray(p)) p.forEach(name => { if (typeof name === "string") profiles.add(name); });
    }
    return [...profiles].sort();
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
