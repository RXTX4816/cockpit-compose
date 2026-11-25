import { getHost } from "@rxtx4816/cockpit-plugin-base-react/host";
import { compose, cli, dockerSpawnEnviron, composeSupportsProgress, socketSuperuser } from "../cockpit";
import { fileFlags } from "./internal";
import { engine } from "./engine";

export async function snapshotProjectContainerIds(project: string): Promise<Set<string>> {
  try {
    const raw = await getHost().run(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
      { superuser: socketSuperuser(), ...dockerSpawnEnviron() },
    );
    return new Set(raw.split("\n").map(l => l.trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

export async function forceRemoveOneoffContainers(
  project: string,
  preRunIds: Set<string>,
  superuser?: "try",
): Promise<void> {
  const raw = await getHost().run(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { superuser, ...dockerSpawnEnviron() },
  );
  const ids = raw.split("\n").map(l => l.trim()).filter(id => id && !preRunIds.has(id));
  if (ids.length === 0) return;
  await getHost().run(cli("rm", "-f", ...ids), { superuser, ...dockerSpawnEnviron() });
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
  const noTtyFlag = engine().runFlags;
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
