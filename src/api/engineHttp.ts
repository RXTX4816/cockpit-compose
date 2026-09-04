import { getDockerSocketPath, getPodmanSocketPath, getIsPodman, socketSuperuser } from "./cockpit";

// Once a socket request fails (old engine version, path unreachable, unexpected response),
// skip retrying the HTTP path for a while rather than paying a failed-connection cost on
// every single poll — the CLI fallback handles those ticks in the meantime. Cleared as soon
// as a request succeeds again.
const UNAVAILABLE_RETRY_MS = 60_000;
let unavailableSince: number | undefined;

function currentSocketPath(): string | undefined {
  const raw = getIsPodman() ? getPodmanSocketPath() : getDockerSocketPath();
  // getDockerSocketPath()/getPodmanSocketPath() return "unix:///path/to.sock" (matching the
  // DOCKER_HOST format used for CLI env vars) — cockpit.http() wants the bare filesystem path.
  return raw?.replace(/^unix:\/\//, "");
}

// GETs `path` from the current container engine's REST API over its Unix socket and parses
// the response as JSON. Throws (and briefly disables further HTTP attempts) on any failure —
// callers are expected to catch this and fall back to the equivalent CLI command.
export async function engineHttpGetJson<T>(path: string, params?: Record<string, string>): Promise<T> {
  if (unavailableSince !== undefined && Date.now() - unavailableSince < UNAVAILABLE_RETRY_MS) {
    throw new Error("engine socket recently failed, skipping HTTP path");
  }
  const socketPath = currentSocketPath();
  if (!socketPath) throw new Error("no engine socket detected");

  const http = cockpit.http(socketPath, { superuser: socketSuperuser() });
  try {
    const raw = await http.get(path, params);
    unavailableSince = undefined;
    return JSON.parse(raw) as T;
  } catch (e) {
    unavailableSince = Date.now();
    throw e;
  } finally {
    http.close();
  }
}

// Test-only: resets the failure cooldown so each test starts from a clean slate.
export function _resetEngineHttpAvailabilityForTests(): void {
  unavailableSince = undefined;
}

// Collects a CockpitProcess's streamed output into a single string once it completes — used
// to fall back to an existing CLI-based implementation from inside an async HTTP-first path.
export async function drainProcess(proc: CockpitProcess): Promise<string> {
  let raw = "";
  proc.stream(d => { raw += d; });
  await proc;
  return raw;
}
