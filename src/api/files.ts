import type { Snapshot } from "./types";

export function readComposeFile(path: string): CockpitProcess {
  return cockpit.spawn(["cat", path], { err: "message" });
}

export async function saveComposeFile(path: string, content: string, superuser?: "try"): Promise<void> {
  const file = cockpit.file(path, { superuser });
  await file.replace(content);
}

export async function saveSnapshot(composeFilePath: string, content: string, superuser?: "try"): Promise<Snapshot> {
  const timestamp = Date.now();
  const snapshotPath = `${composeFilePath}.snapshot.${timestamp}`;
  const file = cockpit.file(snapshotPath, { superuser });
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

export async function deleteSnapshot(snapshotPath: string, superuser?: "try"): Promise<void> {
  await cockpit.spawn(["rm", snapshotPath], { superuser, err: "message" });
}

export async function readEnvFile(path: string, superuser?: "try"): Promise<{ content: string; exists: boolean }> {
  const content = await cockpit.file(path, { superuser }).read() as string | null;
  return content === null
    ? { content: "", exists: false }
    : { content, exists: true };
}

export async function saveEnvFile(path: string, content: string, superuser?: "try"): Promise<void> {
  await cockpit.file(path, { superuser }).replace(content);
}

export function findEnvFiles(dir: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "1", "-type", "f",
      "(", "-name", ".env", "-o", "-name", ".env.*", "-o", "-name", "*.env", ")"],
    { superuser, err: "message" },
  );
}

export function findComposeFiles(dir: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "2", "-type", "f",
      "(", "-name", "compose.yml", "-o", "-name", "compose.yaml",
      "-o", "-name", "docker-compose.yml", "-o", "-name", "docker-compose.yaml", ")"],
    { superuser, err: "message" },
  );
}

export function createDirectory(path: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(["mkdir", "-p", "--", path], { superuser, err: "message" });
}

export function makeTempDir(): CockpitProcess {
  return cockpit.spawn(["mktemp", "-d"], { err: "message" });
}

// Shallow-clone repo to caller-provided tmpdir. Caller reads compose file then calls removeDirectory.
export function fetchComposeFromGit(url: string, tmpDir: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["git", "clone", "--depth", "1", "--no-local",
     "--config", "core.hooksPath=/dev/null",
     "--filter=blob:none", "--", url, tmpDir],
    { superuser, err: "out" },
  );
}

export function removeDirectory(path: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(["rm", "-rf", "--", path], { superuser, err: "message" });
}

export function removeFile(path: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(["rm", "--", path], { superuser, err: "message" });
}
