import { type ComposeContainer, parseStackStatus } from "../api";

/**
 * Derives the effective display status of a stack.
 * If the base status is "partial" but all exited containers exited cleanly (exit code 0),
 * we treat it as "running" (e.g. a one-shot init container that completed successfully).
 */
export function effectiveStatus(
  base: ReturnType<typeof parseStackStatus>,
  containers: ComposeContainer[],
): ReturnType<typeof parseStackStatus> {
  if (base !== "partial" || containers.length === 0) return base;
  const exited = containers.filter(c => c.State === "exited");
  if (exited.length === 0) return base;
  return exited.every(c => /exited \(0\)/i.test(c.Status)) ? "running" : base;
}

/**
 * Returns the overall health summary for a set of containers.
 * Returns null when no containers report a health status.
 */
export function stackHealthSummary(
  containers: ComposeContainer[],
): "healthy" | "unhealthy" | null {
  const withHealth = containers.filter(c => c.Health);
  if (withHealth.length === 0) return null;
  if (withHealth.some(c => c.Health!.toLowerCase() !== "healthy")) return "unhealthy";
  return "healthy";
}
