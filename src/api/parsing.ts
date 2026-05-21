import { load as loadYaml } from "js-yaml";
import type { StackStatus } from "./types";

export function parseStackStatus(status: string): StackStatus {
  const lower = status.toLowerCase();
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

export function getHealthStatus(status: string): "healthy" | "partial" | "unhealthy" {
  const lower = status.toLowerCase();
  const hasRunning = /running\(\d+\)/.test(lower);
  const hasExited = /exit|stopped/.test(lower);
  if (hasRunning && !hasExited) return "healthy";
  if (hasRunning && hasExited) return "partial";
  return "unhealthy";
}

export function parsePorts(portsStr: string): string[] {
  if (!portsStr) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of portsStr.split(",")) {
    const m = part.trim().match(/(?:[\d.]+):(\d+)->(\d+)\/\w+/);
    if (m) {
      const label = `${m[1]}→${m[2]}`;
      if (!seen.has(label)) { seen.add(label); result.push(label); }
    }
  }
  return result;
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
