// Shapes and helpers for the raw JSON returned by the Docker/Podman Engine REST API
// (GET /containers/json), as opposed to the CLI's own `--format json` output — the two use
// different field names and structure for the same data (e.g. `Id` vs `ID`, ports as
// structured objects vs a pre-formatted string), so responses from the HTTP path are
// converted to match what the existing CLI-based code already produces.

export interface EngineContainerPort {
  IP?: string;
  PrivatePort: number;
  PublicPort?: number;
  Type: string;
}

export interface EngineContainerJson {
  Id: string;
  Names?: string[];
  Image: string;
  State: string;
  Status: string;
  Ports?: EngineContainerPort[];
  Labels?: Record<string, string>;
}

export function engineContainerName(c: EngineContainerJson): string {
  return (c.Names?.[0] ?? "").replace(/^\//, "");
}

// Matches the CLI's Ports column: only published (host-mapped) ports are shown, not every
// port the image merely EXPOSEs.
export function enginePortsToString(ports: EngineContainerPort[] | undefined): string {
  if (!ports || ports.length === 0) return "";
  return ports
    .filter(p => p.PublicPort !== undefined)
    .map(p => `${p.IP || "0.0.0.0"}:${p.PublicPort}->${p.PrivatePort}/${p.Type}`)
    .join(", ");
}

export function isOneoffContainer(c: EngineContainerJson): boolean {
  return c.Labels?.["com.docker.compose.oneoff"]?.toLowerCase() === "true";
}
