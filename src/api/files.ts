import type { Snapshot } from "./types";
import { getProfilesFromCompose } from "./parsing";
import {
  createTarArchive,
  extractTarArchive,
  listTarArchives,
  listArchiveMembers,
  readArchiveMember,
  type TarCreateResult,
} from "@rxtx4816/cockpit-plugin-base-react/lib/tar";
import { readFile, writeFile } from "@rxtx4816/cockpit-plugin-base-react/lib/cockpit-fs";

export function readComposeFile(path: string): CockpitProcess {
  return cockpit.spawn(["cat", path], { err: "message" });
}

export async function readAllProfiles(configFile: string): Promise<string[]> {
  try {
    let content = "";
    const proc = readComposeFile(configFile);
    proc.stream((d: string) => { content += d; });
    await proc;
    return getProfilesFromCompose(content);
  } catch {
    return [];
  }
}

export async function saveComposeFile(path: string, content: string, superuser?: "try"): Promise<void> {
  await writeFile(path, content, superuser);
}

export async function saveSnapshot(composeFilePath: string, content: string, superuser?: "try"): Promise<Snapshot> {
  const timestamp = Date.now();
  const snapshotPath = `${composeFilePath}.snapshot.${timestamp}`;
  await writeFile(snapshotPath, content, superuser);
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
  const content = await readFile(path, superuser);
  return content === null
    ? { content: "", exists: false }
    : { content, exists: true };
}

export async function saveEnvFile(path: string, content: string, superuser?: "try"): Promise<void> {
  await writeFile(path, content, superuser);
}

export function findEnvFiles(dir: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "1", "-type", "f",
      "(", "-name", ".env", "-o", "-name", ".env.*", "-o", "-name", "*.env", ")"],
    { superuser, err: "message" },
  );
}

export function listYamlFilesInDir(dir: string, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "1", "-type", "f",
      "(", "-name", "*.yml", "-o", "-name", "*.yaml", ")"],
    { superuser, err: "message" },
  );
}

export function findComposeFiles(dir: string, maxDepth: number = 2, superuser?: "try"): CockpitProcess {
  return cockpit.spawn(
    ["find", dir, "-maxdepth", String(maxDepth), "-type", "f",
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

export async function findBackupArchives(dir: string, superuser?: "try"): Promise<string[]> {
  return listTarArchives(dir, "*.bak.tar.gz", { maxDepth: 1, superuser });
}

export async function listArchiveContents(archivePath: string, superuser?: "try"): Promise<string[]> {
  return listArchiveMembers(archivePath, { superuser });
}

export async function extractArchive(archivePath: string, targetParentDir: string, superuser?: "try"): Promise<void> {
  return extractTarArchive(archivePath, targetParentDir, { superuser });
}

export async function readFileFromArchive(archivePath: string, memberPath: string, superuser?: "try"): Promise<string> {
  return readArchiveMember(archivePath, memberPath, { superuser });
}

export async function createBackupArchive(
  parentDir: string,
  dirName: string,
  destPath: string,
  options: { includeSnapshots: boolean; includeSubdirs: boolean },
  superuser?: "try",
): Promise<TarCreateResult> {
  const exclude: string[] = [];
  const extraArgs: string[] = [];
  if (!options.includeSnapshots) {
    extraArgs.push("--wildcards");
    exclude.push("*.snapshot.*");
  }
  if (!options.includeSubdirs) {
    // Discover immediate subdirectories via find and exclude each by exact name.
    // Wildcard patterns with trailing slash (gitea/*/) are unreliable across GNU tar versions
    // because tar checks paths during traversal without trailing slashes.
    let findOut = "";
    const findProc = cockpit.spawn(
      ["find", `${parentDir}/${dirName}`, "-mindepth", "1", "-maxdepth", "1", "-type", "d"],
      { superuser, err: "message" },
    );
    findProc.stream((d: string) => { findOut += d; });
    await findProc;
    for (const line of findOut.trim().split("\n").filter(l => l.trim())) {
      const name = line.substring(line.lastIndexOf("/") + 1);
      exclude.push(`${dirName}/${name}`);
    }
  }
  return createTarArchive(destPath, parentDir, dirName, { exclude, extraArgs, superuser });
}
