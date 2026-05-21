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
