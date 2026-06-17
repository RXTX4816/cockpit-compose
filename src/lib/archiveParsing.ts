// Functions for parsing tar archive listings used by RestoreModal.

const COMPOSE_PRECEDENCE = new Map(
  ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"].map((n, i) => [n, i]),
);

/**
 * Finds the common root directory of archive entries.
 * Returns the first path segment from the first entry that contains a "/".
 */
export function parseArchiveRootDir(contents: string): string | null {
  for (const line of contents.trim().split("\n")) {
    const idx = line.indexOf("/");
    if (idx > 0) return line.substring(0, idx);
  }
  return null;
}

/**
 * Finds the primary compose file member inside the archive.
 * Returns the full archive path (e.g. "myapp/compose.yaml") or null.
 */
export function findPrimaryComposeMember(contents: string, rootDir: string): string | null {
  const candidates = contents.trim().split("\n")
    .map(l => l.trim())
    .filter(l => {
      const [dir, file] = l.split("/");
      return dir === rootDir && COMPOSE_PRECEDENCE.has(file);
    });
  candidates.sort((a, b) => {
    const pa = COMPOSE_PRECEDENCE.get(a.split("/")[1]) ?? 99;
    const pb = COMPOSE_PRECEDENCE.get(b.split("/")[1]) ?? 99;
    return pa - pb;
  });
  return candidates[0] ?? null;
}

/**
 * Parses the stack name from a compose file's content.
 * Returns the value of the `name:` field, or null if not found.
 */
export function parseComposeName(content: string): string | null {
  const m = content.match(/^name:\s+(\S+)/m);
  return m ? m[1] : null;
}
