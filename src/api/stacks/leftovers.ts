import { cli, getIsPodman, getSocketMode, dockerSpawnEnviron } from "../cockpit";

/**
 * What Docker still lists for a project after Down or Kill (#345).
 *
 * `damaged` holds the IDs Docker lists but cannot resolve: `ps -a` shows them, yet every
 * other command answers "no such container". That is a damaged container record, left
 * behind by a crash or power loss mid-write. Docker can neither start nor remove such a
 * container, so nothing in the plugin can get the stack out of the list without the
 * repair below.
 */
export interface StackLeftovers {
  /** Full IDs of every container still labelled with the project. */
  ids: string[];
  /** The subset with damaged records. Always empty on Podman, which is not repaired. */
  damaged: string[];
}

function env(superuser?: "try") {
  return { superuser, err: "message" as const, ...dockerSpawnEnviron() };
}

export async function findStackLeftovers(project: string, superuser?: "try"): Promise<StackLeftovers> {
  const out = await cockpit.spawn(
    cli("ps", "-a", "--no-trunc", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
    env(superuser),
  );
  const ids = out.split("\n").map(l => l.trim()).filter(Boolean);
  if (ids.length === 0 || getIsPodman()) return { ids, damaged: [] };

  const damaged: string[] = [];
  for (const id of ids) {
    try {
      await cockpit.spawn(cli("inspect", "--format", "{{.Id}}", id), env(superuser));
    } catch (ex: unknown) {
      if (/no such (object|container)/i.test(String(ex instanceof Error ? ex.message : ex))) damaged.push(id);
    }
  }
  return { ids, damaged };
}

export interface RepairPlan {
  rootless: boolean;
  /** Docker's data root, e.g. /var/lib/docker or ~/.local/share/docker. */
  dataRoot: string;
  /** The shell commands the repair runs, for showing and copying. */
  commands: string[];
}

const FULL_ID = /^[0-9a-f]{64}$/;

/** Builds the repair for damaged records: stop Docker, delete each record, start Docker. */
export async function planDamagedRepair(damaged: string[], superuser?: "try"): Promise<RepairPlan> {
  const dataRoot = (await cockpit.spawn(cli("info", "--format", "{{.DockerRootDir}}"), env(superuser))).trim();
  // Both go into rm -rf paths, so refuse anything that is not exactly what we expect.
  if (!dataRoot.startsWith("/") || dataRoot.includes("..")) throw new Error(`Unexpected Docker data root: ${dataRoot}`);
  const ids = damaged.filter(id => FULL_ID.test(id));
  const rootless = getSocketMode("docker") === "rootless";
  const sudo = rootless ? "" : "sudo ";
  const systemctl = rootless ? "systemctl --user" : `${sudo}systemctl`;
  const units = rootless ? "docker" : "docker docker.socket";
  return {
    rootless,
    dataRoot,
    commands: [
      `${systemctl} stop ${units}`,
      ...ids.map(id => `${sudo}rm -rf ${dataRoot}/containers/${id}`),
      `${systemctl} start docker`,
    ],
  };
}

/**
 * Runs a repair plan. Stopping Docker stops every container on that daemon; containers
 * without a restart policy stay stopped afterwards, which the caller must make clear
 * before calling this. Docker is started again even if removing a record fails.
 */
export async function runDamagedRepair(plan: RepairPlan): Promise<void> {
  const run = (argv: string[]) => cockpit.spawn(argv, { superuser: plan.rootless ? undefined : "require", err: "message" });
  const systemctl = plan.rootless ? ["systemctl", "--user"] : ["systemctl"];
  const units = plan.rootless ? ["docker"] : ["docker", "docker.socket"];
  const ids = plan.commands
    .map(c => /\/containers\/([0-9a-f]{64})$/.exec(c)?.[1])
    .filter((id): id is string => Boolean(id));

  await run([...systemctl, "stop", ...units]);
  try {
    for (const id of ids) await run(["rm", "-rf", `${plan.dataRoot}/containers/${id}`]);
  } finally {
    await run([...systemctl, "start", "docker"]);
  }
}
