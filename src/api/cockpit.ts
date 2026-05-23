let composePrefix: string[] = ["docker", "compose"];
let composeDetected = false;

export async function detectComposeCommand(): Promise<void> {
  if (composeDetected) return;
  composeDetected = true;
  try {
    await cockpit.spawn(["docker", "compose", "version"], { err: "message" });
    composePrefix = ["docker", "compose"];
  } catch {
    try {
      await cockpit.spawn(["docker-compose", "version"], { err: "message" });
      composePrefix = ["docker-compose"];
    } catch {
      composePrefix = ["docker", "compose"];
    }
  }
}

export function compose(...args: string[]): string[] {
  return [...composePrefix, ...args];
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
export async function composeFileSuperuser(configFile: string): Promise<"try" | undefined> {
  try {
    const parentDir = configFile.lastIndexOf("/") > 0
      ? configFile.substring(0, configFile.lastIndexOf("/"))
      : "/";
    const user = await cockpit.user();
    const dirUid = await statOwnerUid(parentDir);
    if (dirUid !== user.id) return "try";
    try {
      const fileUid = await statOwnerUid(configFile);
      return fileUid === user.id ? undefined : "try";
    } catch {
      // File doesn't exist yet — parent directory check is sufficient.
      return undefined;
    }
  } catch {
    return "try";
  }
}
