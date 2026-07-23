import { compose, cli, getIsPodman, dockerSpawnEnviron, composeSupportsProgress, socketSuperuser } from "../cockpit";
import { fileFlags } from "./internal";

export async function snapshotProjectContainerIds(project: string): Promise<Set<string>> {
  let raw = "";
  const proc = cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { superuser: socketSuperuser(), err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  try { await proc; } catch { return new Set(); }
  return new Set(raw.split("\n").map(l => l.trim()).filter(Boolean));
}

export async function forceRemoveOneoffContainers(
  project: string,
  preRunIds: Set<string>,
  superuser?: "try",
): Promise<void> {
  let raw = "";
  const proc = cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  await proc;
  const ids = raw.split("\n").map(l => l.trim()).filter(id => id && !preRunIds.has(id));
  if (ids.length === 0) return;
  await cockpit.spawn(cli("rm", "-f", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
}

export type RunCommand =
  | { mode: "args"; command: string[] }
  | { mode: "override"; command: string[] };

export function composeRunStream(
  project: string,
  configFiles: string[],
  service: string,
  command: RunCommand,
  rm: boolean,
  superuser?: "try",
): CockpitProcess {
  // Podman Compose run may garble output without -T when no PTY is allocated
  const noTtyFlag = getIsPodman() ? ["-T"] : [];
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  // "args" (default) appends the typed tokens as CMD arguments to the image's own
  // ENTRYPOINT — this is what makes e.g. typing just "--help" work. "override" instead
  // replaces the entrypoint with the command's own first token (e.g. a full binary
  // path, as in a real terminal `exec`), so it runs directly instead of being appended
  // after the existing entrypoint. Deliberately does NOT shell out via `sh -c`: many
  // minimal/distroless images have no shell binary at all, which would otherwise fail
  // with "exec: sh: executable file not found in $PATH".
  const entrypointFlag = command.mode === "override" ? ["--entrypoint", command.command[0]] : [];
  const commandArgs = command.mode === "override" ? command.command.slice(1) : command.command;
  return cockpit.spawn(
    compose(...progressFlag, "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), ...noTtyFlag, ...entrypointFlag, service, ...commandArgs),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}
