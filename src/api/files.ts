import type { Snapshot } from "./types";

export function readComposeFile(path: string): CockpitProcess {
  return cockpit.spawn(["cat", path], { err: "message" });
}

export async function saveComposeFile(path: string, content: string): Promise<void> {
  const file = cockpit.file(path, { superuser: "try" });
  await file.replace(content);
}

export async function saveSnapshot(composeFilePath: string, content: string): Promise<Snapshot> {
  const timestamp = Date.now();
  const snapshotPath = `${composeFilePath}.snapshot.${timestamp}`;
  const file = cockpit.file(snapshotPath, { superuser: "try" });
  await file.replace(content);
  return {
    timestamp,
    name: new Date(timestamp).toLocaleString(),
    path: snapshotPath,
  };
}

export function listSnapshots(composeFilePath: string): CockpitProcess {
  const dir = composeFilePath.substring(0, composeFilePath.lastIndexOf("/"));
  const filename = composeFilePath.substring(composeFilePath.lastIndexOf("/") + 1);
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "1", "-name", `${filename}.snapshot.*`, "-type", "f"],
    { err: "message" },
  );
}

export async function restoreSnapshot(snapshotPath: string): Promise<string> {
  let content = "";
  const proc = cockpit.spawn(["cat", snapshotPath], { err: "message" });
  proc.stream(data => { content += data; });
  await proc;
  return content;
}

export async function deleteSnapshot(snapshotPath: string): Promise<void> {
  await cockpit.spawn(["rm", snapshotPath], { superuser: "try", err: "message" });
}

export async function readEnvFile(path: string): Promise<{ content: string; exists: boolean }> {
  const content = await cockpit.file(path, { superuser: "try" }).read<string>();
  return content === null
    ? { content: "", exists: false }
    : { content, exists: true };
}

export async function saveEnvFile(path: string, content: string): Promise<void> {
  await cockpit.file(path, { superuser: "try" }).replace(content);
}
