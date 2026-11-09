import { composeFileSuperuser } from "./cockpit";
import { createDirectory, saveComposeFile, saveSnapshot } from "./files";

// Writing a stack's files: whether the writes need admin rights depends on who owns the
// files and their directory, so it is decided here from the paths, never by the caller.

/** Saves an edited compose file, taking a Snapshot of the previous content first. */
export async function saveStackFile(path: string, previousContent: string, newContent: string): Promise<void> {
  const su = await composeFileSuperuser([path]);
  await saveSnapshot(path, previousContent, su);
  await saveComposeFile(path, newContent, su);
}

/** Adds a file next to a stack's existing ones. */
export async function addStackFile(existingFiles: string[], path: string, content: string): Promise<void> {
  await saveComposeFile(path, content, await composeFileSuperuser(existingFiles));
}

/** Creates a stack's directory and writes its files into it. */
export async function createStackFiles(dir: string, files: { path: string; content: string }[]): Promise<void> {
  const su = await composeFileSuperuser(files.map(f => f.path));
  await createDirectory(dir, su);
  for (const f of files) await cockpit.file(f.path, { superuser: su }).replace(f.content);
}
