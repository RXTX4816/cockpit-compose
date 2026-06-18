import { compose, cli, getIsPodman, dockerSpawnEnviron, composeSupportsProgress, composeIsLimitedBackend } from "../cockpit";
import { fileFlags, makeFakeProcess } from "./internal";

export function startStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function stopStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "stop"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
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
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "down"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
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

function pauseUnpausePodmanFallback(project: string, action: "pause" | "unpause", superuser?: "try"): CockpitProcess {
  return makeFakeProcess(async () => {
    let psRaw = "";
    const psProc = cockpit.spawn(
      cli("ps", "-a", "--filter", `label=com.docker.compose.project=${project}`, "--format", "json"),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    psProc.stream((d: string) => { psRaw += d; });
    await psProc;
    interface PsEntry { Id: string; }
    const containers = JSON.parse(psRaw) as PsEntry[];
    if (!Array.isArray(containers) || containers.length === 0) return "";
    const ids = containers.map(c => c.Id);
    let out = "";
    const proc = cockpit.spawn(cli(action, ...ids), { superuser, err: "message", ...dockerSpawnEnviron() });
    proc.stream((d: string) => { out += d; });
    try {
      await proc;
    } catch (e: unknown) {
      if (String(e).includes("cgroup")) {
        throw new Error("Pause is not supported on this system. Enable cgroup v2 delegation for rootless Podman (see /etc/systemd/system/user@.service.d/).");
      }
      throw e;
    }
    return out;
  });
}

export function pauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  if (getIsPodman()) return pauseUnpausePodmanFallback(project, "pause", superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "pause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}

export function unpauseStack(project: string, configFiles: string[], profiles: string[] = [], superuser?: "try"): CockpitProcess {
  if (getIsPodman()) return pauseUnpausePodmanFallback(project, "unpause", superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "unpause"),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
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

function scaleStackPodmanFallback(
  project: string,
  configFiles: string[],
  scales: Record<string, number>,
  profiles: string[] = [],
  superuser?: "try",
): CockpitProcess {
  return makeFakeProcess(async () => {
    const profileFlags = profiles.flatMap(p => ["--profile", p]);
    const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
    let out = "";
    const upProc = cockpit.spawn(
      compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", "--force-recreate", ...scaleFlags),
      { superuser, err: "message", ...dockerSpawnEnviron() },
    );
    upProc.stream(d => { out += d; });
    await upProc;

    for (const [svc, targetCount] of Object.entries(scales)) {
      let psRaw = "";
      const psProc = cockpit.spawn(
        cli("ps", "-a",
          "--filter", `label=com.docker.compose.project=${project}`,
          "--filter", `label=com.docker.compose.service=${svc}`,
          "--format", "json"),
        { err: "message", ...dockerSpawnEnviron() },
      );
      psProc.stream(d => { psRaw += d; });
      await psProc;

      interface PsEntry { Id: string; Names?: string[] }
      const containers = JSON.parse(psRaw) as PsEntry[];
      if (containers.length <= targetCount) continue;

      containers.sort((a, b) => {
        const idx = (c: PsEntry) => { const m = (c.Names?.[0] ?? "").match(/_(\d+)$/); return m ? parseInt(m[1], 10) : 0; };
        return idx(b) - idx(a);
      });
      const excess = containers.slice(0, containers.length - targetCount).map(c => c.Id);
      await cockpit.spawn(cli("stop", ...excess), { superuser, err: "message", ...dockerSpawnEnviron() });
      await cockpit.spawn(cli("rm", ...excess), { superuser, err: "message", ...dockerSpawnEnviron() });
    }

    return out;
  });
}

export function scaleStack(
  project: string,
  configFiles: string[],
  scales: Record<string, number>,
  profiles: string[] = [],
  superuser?: "try",
): CockpitProcess {
  if (composeIsLimitedBackend()) return scaleStackPodmanFallback(project, configFiles, scales, profiles, superuser);
  const profileFlags = profiles.flatMap(p => ["--profile", p]);
  const scaleFlags = Object.entries(scales).flatMap(([svc, n]) => ["--scale", `${svc}=${n}`]);
  return cockpit.spawn(
    compose(...profileFlags, "-p", project, ...fileFlags(configFiles), "up", "-d", ...scaleFlags),
    { superuser, err: "message", ...dockerSpawnEnviron() },
  );
}
