export type Runtime = "docker" | "podman";
export type SocketMode = "rootless" | "rootful";

let currentRuntime: Runtime = (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime;
let composePrefix: string[] = [currentRuntime, "compose"];
const detectedPrefixes = new Map<Runtime, string[]>();
const detectedProgressSupport = new Map<Runtime, boolean>();

interface SocketCandidate {
  path: string;
  environ: string[];
}

interface RuntimeSocketInfo {
  rootless?: SocketCandidate;
  rootful?: SocketCandidate;
  // True when the rootful socket check got "permission denied" rather than "no such file" —
  // meaning the socket almost certainly exists, but Cockpit's superuser bridge isn't currently
  // enabled ("Administrative access" toggle, in the Cockpit shell, outside this plugin) so we
  // can't confirm or use it yet. Distinguishing this from "genuinely absent" lets the UI say so
  // instead of just hiding the toggle as if nothing were there.
  rootfulNeedsAdminAccess?: boolean;
  detected: boolean;
}

const socketInfo: Record<Runtime, RuntimeSocketInfo> = {
  docker: { detected: false },
  podman: { detected: false },
};

function socketModeKey(runtime: Runtime): string {
  return `cockpit-compose:socketMode:${runtime}`;
}

function getStoredSocketMode(runtime: Runtime): SocketMode | undefined {
  try {
    const v = localStorage.getItem(socketModeKey(runtime));
    return v === "rootless" || v === "rootful" ? v : undefined;
  } catch {
    return undefined;
  }
}

// Fired whenever the socket mode changes, so components that don't own the toggle
// (e.g. the footer's rootless/rootful badge) can refresh without prop-drilling.
export const SOCKET_MODE_CHANGE_EVENT = "cockpit-compose:socketmode";

// Persists the user's explicit choice. Once set, it sticks even if the other
// mode later becomes available too — mirrors how the docker/podman runtime
// choice itself doesn't silently revert once picked.
export function setSocketMode(runtime: Runtime, mode: SocketMode): void {
  try {
    localStorage.setItem(socketModeKey(runtime), mode);
  } catch { /* localStorage unavailable — falls back to auto-detected default */ }
  try {
    window.dispatchEvent(new Event(SOCKET_MODE_CHANGE_EVENT));
  } catch { /* no window (e.g. tests without jsdom) */ }
}

// Effective mode for a runtime: the user's explicit preference when it still points at a
// detected candidate, otherwise the best available default (rootless preferred, matching
// today's implicit behavior), otherwise undefined when neither socket was found.
export function getSocketMode(runtime: Runtime = currentRuntime): SocketMode | undefined {
  const info = socketInfo[runtime];
  const pref = getStoredSocketMode(runtime);
  if (pref === "rootless" && info.rootless) return "rootless";
  if (pref === "rootful" && info.rootful) return "rootful";
  if (info.rootless) return "rootless";
  if (info.rootful) return "rootful";
  return undefined;
}

export function getSocketAvailability(
  runtime: Runtime = currentRuntime,
): { rootless: boolean; rootful: boolean; rootfulNeedsAdminAccess: boolean } {
  const info = socketInfo[runtime];
  return { rootless: !!info.rootless, rootful: !!info.rootful, rootfulNeedsAdminAccess: !!info.rootfulNeedsAdminAccess };
}

interface StatResult {
  isSocket: boolean;
  // "Permission denied" (EACCES) rather than "no such file" (ENOENT) — the path likely exists
  // but couldn't be confirmed without escalated access.
  permissionDenied: boolean;
}

async function statPath(path: string, superuser?: "try"): Promise<StatResult> {
  let out = "";
  let errMsg = "";
  try {
    const proc = cockpit.spawn(["stat", "-c", "%F", "--", path], { superuser, err: "message" });
    proc.stream(d => { out += d; });
    await proc;
    return { isSocket: out.trim() === "socket", permissionDenied: false };
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e);
    return { isSocket: false, permissionDenied: /permission denied/i.test(errMsg) };
  }
}

// Detects both the rootless (per-user) and rootful (system-wide) Docker sockets, independent
// of which one the user currently has selected — so the mode toggle knows what's available.
export async function detectDockerMode(): Promise<void> {
  const info = socketInfo.docker;
  info.rootless = undefined;
  info.rootful = undefined;
  info.rootfulNeedsAdminAccess = false;

  const user = await cockpit.user().catch(() => undefined);
  if (user) {
    const userSocket = `/run/user/${user.id}/docker.sock`;
    if ((await statPath(userSocket)).isSocket) {
      info.rootless = { path: `unix://${userSocket}`, environ: [`DOCKER_HOST=unix://${userSocket}`] };
    }
  }

  const rootful = await statPath("/var/run/docker.sock", "try");
  if (rootful.isSocket) {
    info.rootful = { path: "unix:///var/run/docker.sock", environ: ["DOCKER_HOST=unix:///var/run/docker.sock"] };
  } else if (rootful.permissionDenied) {
    info.rootfulNeedsAdminAccess = true;
  }

  info.detected = true;
}

// Detects both the rootless (per-user) and rootful (system-wide) Podman sockets. Sets DOCKER_HOST
// so that `podman compose` (which may delegate to docker-compose) queries Podman's Docker-compat
// API instead of Docker. Cached after the first run unless `force` is passed (manual recheck).
async function detectPodmanSocket(force = false): Promise<void> {
  const info = socketInfo.podman;
  if (info.detected && !force) return;

  info.rootless = undefined;
  info.rootful = undefined;
  info.rootfulNeedsAdminAccess = false;

  try {
    const user = await cockpit.user();
    const userSocket = `/run/user/${user.id}/podman/podman.sock`;
    if ((await statPath(userSocket)).isSocket) {
      // XDG_RUNTIME_DIR must be set so libpod connects to the user D-Bus socket
      // (/run/user/<uid>/bus) instead of the system bus.  Without it, Podman's
      // systemd cgroup manager calls StartTransientUnit on the system bus, which
      // requires polkit auth that Cockpit's non-interactive bridge doesn't have.
      info.rootless = {
        path: `unix://${userSocket}`,
        environ: [`DOCKER_HOST=unix://${userSocket}`, `XDG_RUNTIME_DIR=/run/user/${user.id}`],
      };
    }
  } catch { /* cockpit.user() unavailable or user socket check failed */ }

  const rootful = await statPath("/run/podman/podman.sock", "try");
  if (rootful.isSocket) {
    info.rootful = { path: "unix:///run/podman/podman.sock", environ: ["DOCKER_HOST=unix:///run/podman/podman.sock"] };
  } else if (rootful.permissionDenied) {
    info.rootfulNeedsAdminAccess = true;
  }

  info.detected = true;
}

// Re-runs socket detection for a runtime on demand (e.g. a "recheck" action in the UI after
// the user fixes a broken install), bypassing Podman's normal detect-once cache.
export async function redetectSockets(runtime: Runtime): Promise<void> {
  if (runtime === "docker") await detectDockerMode();
  else await detectPodmanSocket(true);
}

// Actively probes whether a specific socket candidate actually works — not just that the
// socket file exists, but that the daemon/storage behind it responds. Rootful candidates are
// probed with superuser "try" (mirrors how real commands escalate); if Cockpit's admin-access
// bridge isn't enabled, this degrades to an unprivileged attempt and reports the real failure.
export async function checkSocketHealth(runtime: Runtime, mode: SocketMode): Promise<{ ok: boolean; reason?: string }> {
  const candidate = socketInfo[runtime][mode];
  if (!candidate) return { ok: false, reason: "socket not detected" };

  const superuser: "try" | undefined = mode === "rootful" ? "try" : undefined;
  const probeArgs = runtime === "podman" ? ["podman", "ps"] : ["docker", "version", "--format", "{{.Server.Version}}"];
  try {
    await cockpit.spawn(probeArgs, { superuser, err: "message", environ: candidate.environ });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

// Returns true when a working compose binary was found, false when falling back to default.
export async function detectComposeCommand(): Promise<boolean> {
  if (currentRuntime === "podman") {
    await detectPodmanSocket();
  }

  if (detectedPrefixes.has(currentRuntime)) {
    composePrefix = detectedPrefixes.get(currentRuntime)!;
    return true;
  }

  const r = currentRuntime;
  const superuser = socketSuperuser();
  let found = false;
  try {
    await cockpit.spawn([r, "compose", "version"], { superuser, err: "message", ...dockerSpawnEnviron() });
    composePrefix = [r, "compose"];
    found = true;
  } catch {
    try {
      const legacy = r === "docker" ? "docker-compose" : "podman-compose";
      await cockpit.spawn([legacy, "version"], { superuser, err: "message", ...dockerSpawnEnviron() });
      composePrefix = [legacy];
      found = true;
    } catch {
      composePrefix = [r, "compose"];
    }
  }
  if (found) {
    detectedPrefixes.set(r, composePrefix);
    let progressSupported = false;
    try {
      await cockpit.spawn([...composePrefix, "--progress", "plain", "version"], { superuser, err: "message", ...dockerSpawnEnviron() });
      progressSupported = true;
    } catch { /* --progress not supported */ }
    detectedProgressSupport.set(r, progressSupported);
  }
  return found;
}

export function setRuntime(runtime: Runtime): void {
  currentRuntime = runtime;
  composePrefix = detectedPrefixes.get(runtime) ?? [runtime, "compose"];
}

export function getIsPodman(): boolean {
  return currentRuntime === "podman";
}

// True when the compose backend is the standalone podman-compose Python tool (either invoked
// directly or via `podman compose` external-provider delegation on Fedora). These backends
// lack --format json on ps/images and have no `volumes` subcommand.
export function composeIsLimitedBackend(): boolean {
  return !composeSupportsProgress() && getIsPodman();
}

// `podman compose` may delegate to standalone podman-compose (which lacks --progress);
// probe at detection time to know for sure.
export function composeSupportsProgress(): boolean {
  if (detectedProgressSupport.has(currentRuntime)) {
    return detectedProgressSupport.get(currentRuntime)!;
  }
  return composePrefix[0] !== "podman-compose";
}

export function cli(...args: string[]): string[] {
  return [currentRuntime, ...args];
}

export function compose(...args: string[]): string[] {
  return [...composePrefix, ...args];
}

export function dockerSpawnEnviron(): { environ?: string[] } {
  const mode = getSocketMode(currentRuntime);
  const info = socketInfo[currentRuntime];
  const candidate = mode === "rootless" ? info.rootless : mode === "rootful" ? info.rootful : undefined;
  if (candidate) return { environ: candidate.environ };

  // Podman's own `compose` subcommand may delegate to an external Docker Compose provider
  // (docker-compose-plugin) when both engines are installed side by side. That delegate reads
  // DOCKER_HOST like any Docker-compatible client — if we don't set it (e.g. because neither
  // Podman socket could be confirmed, commonly because Cockpit's Administrative access isn't
  // enabled so the rootful check couldn't get past "permission denied"), it silently falls back
  // to its own default, which is a completely different, unrelated engine (real Docker) if one
  // happens to be installed and running. Point it at a path that can never exist so any such
  // delegate fails loudly instead of quietly operating on the wrong engine.
  if (currentRuntime === "podman") {
    return { environ: ["DOCKER_HOST=unix:///run/cockpit-compose-no-podman-socket-detected.sock"] };
  }
  return {};
}

export function isRootlessMode(): boolean {
  return getSocketMode(currentRuntime) === "rootless";
}

// Rootful sockets (e.g. /run/podman/podman.sock) are root-owned, so read-only
// discovery/listing calls need to request Cockpit's superuser bridge to succeed.
// "try" is a safe no-op when the bridge isn't enabled — it just runs unprivileged.
export function socketSuperuser(): "try" | undefined {
  return isRootlessMode() ? undefined : "try";
}

function socketPathFor(runtime: Runtime): string | undefined {
  const mode = getSocketMode(runtime);
  const info = socketInfo[runtime];
  return mode === "rootless" ? info.rootless?.path : mode === "rootful" ? info.rootful?.path : undefined;
}

export function getDockerSocketPath(): string | undefined {
  return socketPathFor("docker");
}

export function getPodmanSocketPath(): string | undefined {
  return socketPathFor("podman");
}

async function statOwnerUid(path: string): Promise<number> {
  let raw = "";
  const proc = cockpit.spawn(["stat", "-c", "%u", "--", path], { err: "message" });
  proc.stream(d => { raw += d; });
  await proc;
  return parseInt(raw.trim(), 10);
}

// Returns undefined (no escalation) when both the compose file and its parent
// directory are owned by the current user, otherwise "try". Fails safe to "try"
// so that stacks in root-owned directories continue to work unmodified.
//
// When the compose file doesn't exist yet (e.g., creating a new stack), only
// the parent directory ownership is checked, which is sufficient.
async function checkOneFile(configFile: string, user: { id: number }): Promise<"try" | undefined> {
  const parentDir = configFile.lastIndexOf("/") > 0
    ? configFile.substring(0, configFile.lastIndexOf("/"))
    : "/";
  const dirUid = await statOwnerUid(parentDir);
  if (dirUid !== user.id) return "try";
  try {
    const fileUid = await statOwnerUid(configFile);
    return fileUid === user.id ? undefined : "try";
  } catch {
    return undefined;
  }
}

export async function composeFileSuperuser(configFiles: string[]): Promise<"try" | undefined> {
  try {
    const user = await cockpit.user();
    for (const f of configFiles) {
      if (await checkOneFile(f, user) === "try") return "try";
    }
    return undefined;
  } catch {
    return "try";
  }
}

// Combines socket-level and file-level escalation needs for compose commands that hit
// the container engine socket (up/down/start/stop/exec/run/etc). A rootful socket always
// needs superuser regardless of who owns the compose file; a rootless socket only needs
// it in the rarer case where the compose file/directory itself is root-owned.
export async function stackSuperuser(configFiles: string[]): Promise<"try" | undefined> {
  if (getIsPodman()) {
    // Podman has no DOCKER_HOST-style knob that alone selects rootful vs rootless storage —
    // which one a command hits is determined entirely by whether the process runs as root.
    // Falling back to file-ownership-based escalation here (as Docker safely can, below) would
    // silently escalate a rootless-mode command to root whenever the compose file/directory
    // happens to be root-owned — running it against the *rootful* engine instead, even though
    // the user explicitly selected Rootless in the toggle. So for Podman, escalation must be
    // governed strictly by the selected socket mode, never overridden by file ownership.
    return isRootlessMode() ? undefined : "try";
  }
  if (!isRootlessMode()) return "try";
  return composeFileSuperuser(configFiles);
}
