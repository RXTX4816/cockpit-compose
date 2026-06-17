export type Runtime = "docker" | "podman";

let currentRuntime: Runtime = (localStorage.getItem("cockpit-compose:runtime") ?? "docker") as Runtime;
let composePrefix: string[] = [currentRuntime, "compose"];
const detectedPrefixes = new Map<Runtime, string[]>();
const detectedProgressSupport = new Map<Runtime, boolean>();

let dockerEnviron: string[] | undefined;
let dockerSocketPath: string | undefined;
let rootlessMode = false;

let podmanEnviron: string[] | undefined;
let podmanSocketPath: string | undefined;
let podmanRootless = false;
let podmanSocketDetected = false;

async function isSocket(path: string): Promise<boolean> {
  try {
    let out = "";
    const proc = cockpit.spawn(["stat", "-c", "%F", "--", path], { err: "message" });
    proc.stream(d => { out += d; });
    await proc;
    return out.trim() === "socket";
  } catch {
    return false;
  }
}

export async function detectDockerMode(): Promise<void> {
  let envHost = "";
  try {
    const proc = cockpit.spawn(["sh", "-c", 'printf "%s" "$DOCKER_HOST"'], { err: "message" });
    proc.stream(d => { envHost += d; });
    await proc;
  } catch { /* ignore */ }

  if (envHost.trim()) {
    dockerSocketPath = envHost.trim();
    rootlessMode = envHost.includes("/run/user/");
    return;
  }

  const user = await cockpit.user();
  const userSocket = `/run/user/${user.id}/docker.sock`;

  if (await isSocket(userSocket)) {
    rootlessMode = true;
    dockerSocketPath = `unix://${userSocket}`;
    dockerEnviron = [`DOCKER_HOST=unix://${userSocket}`];
    return;
  }

  if (await isSocket("/var/run/docker.sock")) {
    dockerSocketPath = "unix:///var/run/docker.sock";
  }
}

// Detects the Podman socket and sets DOCKER_HOST so that `podman compose` (which
// delegates to docker-compose) queries Podman's Docker-compat API instead of Docker.
async function detectPodmanSocket(): Promise<void> {
  if (podmanSocketDetected) return;
  podmanSocketDetected = true;

  try {
    const user = await cockpit.user();
    const userSocket = `/run/user/${user.id}/podman/podman.sock`;
    if (await isSocket(userSocket)) {
      podmanRootless = true;
      podmanSocketPath = `unix://${userSocket}`;
      // XDG_RUNTIME_DIR must be set so libpod connects to the user D-Bus socket
      // (/run/user/<uid>/bus) instead of the system bus.  Without it, Podman's
      // systemd cgroup manager calls StartTransientUnit on the system bus, which
      // requires polkit auth that Cockpit's non-interactive bridge doesn't have.
      podmanEnviron = [
        `DOCKER_HOST=${podmanSocketPath}`,
        `XDG_RUNTIME_DIR=/run/user/${user.id}`,
      ];
      return;
    }
  } catch { /* cockpit.user() unavailable or user socket check failed */ }

  if (await isSocket("/run/podman/podman.sock")) {
    podmanSocketPath = "unix:///run/podman/podman.sock";
    podmanEnviron = [`DOCKER_HOST=${podmanSocketPath}`];
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
  let found = false;
  try {
    await cockpit.spawn([r, "compose", "version"], { err: "message", ...dockerSpawnEnviron() });
    composePrefix = [r, "compose"];
    found = true;
  } catch {
    try {
      const legacy = r === "docker" ? "docker-compose" : "podman-compose";
      await cockpit.spawn([legacy, "version"], { err: "message", ...dockerSpawnEnviron() });
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
      await cockpit.spawn([...composePrefix, "--progress", "plain", "version"], { err: "message", ...dockerSpawnEnviron() });
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
  const env = currentRuntime === "podman" ? podmanEnviron : dockerEnviron;
  return env ? { environ: env } : {};
}

export function isRootlessMode(): boolean {
  return currentRuntime === "podman" ? podmanRootless : rootlessMode;
}

export function getDockerSocketPath(): string | undefined {
  return dockerSocketPath;
}

export function getPodmanSocketPath(): string | undefined {
  return podmanSocketPath;
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
