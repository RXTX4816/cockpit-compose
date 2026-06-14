let composePrefix: string[] = ["docker", "compose"];
let composeDetected = false;
let dockerEnviron: string[] | undefined;
let dockerSocketPath: string | undefined;
let rootlessMode = false;

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

export async function detectComposeCommand(): Promise<void> {
  if (composeDetected) return;
  composeDetected = true;
  try {
    await cockpit.spawn(["docker", "compose", "version"], { err: "message", ...dockerSpawnEnviron() });
    composePrefix = ["docker", "compose"];
  } catch {
    try {
      await cockpit.spawn(["docker-compose", "version"], { err: "message", ...dockerSpawnEnviron() });
      composePrefix = ["docker-compose"];
    } catch {
      composePrefix = ["docker", "compose"];
    }
  }
}

export function compose(...args: string[]): string[] {
  return [...composePrefix, ...args];
}

export function dockerSpawnEnviron(): { environ?: string[] } {
  return dockerEnviron ? { environ: dockerEnviron } : {};
}

export function isRootlessMode(): boolean {
  return rootlessMode;
}

export function getDockerSocketPath(): string | undefined {
  return dockerSocketPath;
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
