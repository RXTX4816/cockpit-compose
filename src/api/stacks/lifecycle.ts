import { compose, cli, dockerSpawnEnviron, composeSupportsProgress, composeIsLimitedBackend } from "../cockpit";
import { fileFlags, makeFakeProcess, afterPreparing } from "./internal";
import { engine } from "./engine";

export function startStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

/**
 * Unpauses whichever of the project's containers are paused. Podman refuses to stop or
 * remove a paused container ("container state improper"), so a paused stack could not
 * be stopped or taken down there; Docker copes, but unpausing first is harmless.
 * No-op when nothing is paused, which is also every host where pausing is unsupported.
 */
async function unpausePaused(project: string, superuser?: "try"): Promise<void> {
  const env = { superuser, err: "message" as const, ...dockerSpawnEnviron() };
  const out = await cockpit.spawn(
    cli("ps", "-aq", "--filter", `label=com.docker.compose.project=${project}`, "--filter", "status=paused"),
    env,
  );
  const ids = out.split("\n").map(l => l.trim()).filter(Boolean);
  if (ids.length > 0) await cockpit.spawn(cli("unpause", ...ids), env);
}

export function stopStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return afterPreparing(() => unpausePaused(project, superuser), () => cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  ));
}

export function startService(project: string, configFiles: string[], serviceName: string, profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", serviceName),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function stopService(project: string, configFiles: string[], serviceName: string, profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop", serviceName),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function restartStack(project: string, configFiles: string[], profiles: string[] = [], services: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "restart", ...services),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function downStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return afterPreparing(() => unpausePaused(project, superuser), () => cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "down"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  ));
}

export function upStackStream(project: string, configFiles: string[], profiles: string[], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  const forceRecreate = composeIsLimitedBackend() ? ["--force-recreate"] : [];
  return cockpit.spawn(
    compose(...profileFlags, ...progressFlag, "-p", project, ...fileFlags(configFiles), "up", "-d", ...forceRecreate),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

export function pullStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const progressFlag = composeSupportsProgress() ? ["--progress", "plain"] : [];
  return cockpit.spawn(
    compose(...profileFlags, ...progressFlag, "-p", project, ...fileFlags(configFiles), "pull"),
    { superuser, err: "out", ...dockerSpawnEnviron() },
  );
}

export function pauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  return engine().pause(project, configFiles, profiles, superuser);
}

export function unpauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  return engine().unpause(project, configFiles, profiles, superuser);
}

export function killStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  return makeFakeProcess(async () => {
    const profileFlags = profiles.flatMap(p => ["--profile", p]);
    try {
      await cockpit.spawn(
        compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "kill"),
        { superuser, err: "message", ...dockerSpawnEnviron() },
      );
    } catch { /* compose kill failing (e.g. no running services) is not fatal */ }

    let raw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.ID}}"),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream(d => { raw += d; });
    await psProc;
    const ids = raw.split("\n").map(l => l.trim()).filter(Boolean);
    if (ids.length === 0) return "";
    await cockpit.spawn(cli("rm", "-f", ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
    return "";
  });
}

export function scaleStack(
  project: string,
  configFiles: string[],
  scales: Record<string, number>,
  profiles: string[] = [],
  superuser?: "try",
): CockpitProcess {
  return engine().scale(project, configFiles, scales, profiles, superuser);
}
