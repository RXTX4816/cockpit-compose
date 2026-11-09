import {
  createDirectory, extractArchive, findComposeFiles, makeTempDir, movePath, pathExists,
  readComposeFile, removeDirectory, saveComposeFile,
} from "./files";

export interface RestoreRequest {
  /** Path of the `.bak.tar.gz` to restore. */
  archive: string;
  /** Directory the stack folder is restored into. */
  targetDir: string;
  /** The folder the archive contains at its root. */
  rootDir: string;
  /** The name to restore as; when it differs from `rootDir` the folder and compose `name:` are renamed. */
  name: string;
  /** Replace an existing folder of that name. Without it, an existing folder is an error. */
  overwrite: boolean;
}

/** Why a restore could not start, for the caller to word for the user. */
export class RestoreError extends Error {
  constructor(public readonly code: "src_missing" | "dest_exists", public readonly path: string) {
    super(`${code}: ${path}`);
  }
}

// Order in which a stack's compose file is preferred when a folder holds several.
const COMPOSE_PRECEDENCE = new Map(
  ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].map((n, i) => [n, i]),
);

async function textOf(proc: CockpitProcess): Promise<string> {
  let out = "";
  proc.stream((d: string) => { out += d; });
  await proc;
  return out;
}

async function composeFilesIn(dir: string): Promise<string[]> {
  return (await textOf(findComposeFiles(dir, 1))).trim().split("\n").filter(l => l.trim());
}

// Extracted into a temp dir first, so the live folder is never touched until the copy is
// complete. An existing target is swapped out rather than deleted up front: `mv` onto an
// existing directory nests the restored copy inside it, and deleting first would lose the
// old directory if the move then failed. The old one is only removed once the new one is
// in place, and put back if the move fails.
async function restoreRenamed(req: RestoreRequest, parent: string): Promise<string> {
  const target = `${parent}/${req.name}`;
  const tmpDir = (await textOf(makeTempDir())).trim();
  try {
    await extractArchive(req.archive, tmpDir);
    const extracted = `${tmpDir}/${req.rootDir}`;
    if (!await pathExists(extracted)) throw new RestoreError("src_missing", `${parent}/${req.rootDir}`);
    await createDirectory(target.slice(0, target.lastIndexOf("/")), "try");

    let displaced: string | null = null;
    if (await pathExists(target)) {
      if (!req.overwrite) throw new RestoreError("dest_exists", target);
      displaced = `${target}.restore-displaced-${Date.now()}`;
      await movePath(target, displaced, "try");
    }
    try {
      await movePath(extracted, target, "try");
    } catch (e) {
      if (displaced) await movePath(displaced, target, "try").catch(() => {});
      throw e;
    }
    if (displaced) await removeDirectory(displaced, "try").catch(() => {});
  } finally {
    await removeDirectory(tmpDir).catch(() => {});
  }
  return target;
}

async function rewriteComposeName(dir: string, name: string): Promise<void> {
  const files = (await composeFilesIn(dir)).sort((a, b) => {
    const pa = COMPOSE_PRECEDENCE.get(a.split("/").pop() ?? "") ?? 99;
    const pb = COMPOSE_PRECEDENCE.get(b.split("/").pop() ?? "") ?? 99;
    return pa - pb;
  });
  if (files.length === 0) return;
  const content = await textOf(readComposeFile(files[0]));
  if (/^name:\s+\S+/m.test(content)) {
    await saveComposeFile(files[0], content.replace(/^name:\s+\S+/m, `name: ${name}`));
  }
}

/**
 * Restores a Backup into a directory and returns the compose files of the restored stack.
 * Throws RestoreError when the archive lacks its root folder or the target exists without
 * `overwrite`; any other failure is the underlying command's error.
 */
export async function restoreBackup(req: RestoreRequest): Promise<{ path: string; configFiles: string[] }> {
  const parent = req.targetDir === "/" ? "/" : req.targetDir.replace(/\/$/, "");
  const renamed = req.name !== req.rootDir;
  let path: string;
  if (renamed) {
    path = await restoreRenamed(req, parent);
    await rewriteComposeName(path, req.name);
  } else {
    await createDirectory(parent, "try");
    await extractArchive(req.archive, parent, "try");
    path = `${parent}/${req.rootDir}`;
  }
  return { path, configFiles: await composeFilesIn(path) };
}
