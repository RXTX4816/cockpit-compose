import { compose, cli, getIsPodman, dockerSpawnEnviron, composeSupportsProgress } from "../cockpit";
import { fileFlags } from "./internal";

export async function snapshotProjectContainerIds(project: string): Promise<Set<string>> {
  let raw = "";
  const proc = cockpit.spawn(
    cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    { err: "message", ...dockerSpawnEnviron() },
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
    { err: "message", ...dockerSpawnEnviron() },
  );
  proc.stream(d => { raw += d; });
  await proc;
  const ids = raw.split("\n").map(l => l.trim()).filter(id => id && !preRunIds.has(id));
  if (ids.length === 0) return;
  await cockpit.spawn(cli("rm", "-f", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
}

export function composeRunStream(
  project: string,
  configFiles: string[],
  service: string,
  command: string[],
  rm: boolean,
  superuser?: "try",
): CockpitProcess {
  const noTtyFlag = getIsPodman() ? ["-T"] : [];
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  return cockpit.spawn(
    compose(...progressFlag, "-p", project, ...fileFlags(configFiles),
      "run", ...(rm ? ["--rm"] : []), ...noTtyFlag, service, ...command),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}
