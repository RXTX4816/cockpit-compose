import { compose } from "./cockpit";

export function listStacks(): CockpitProcess {
  return cockpit.spawn(compose("ls", "--all", "--format", "json"), {
    err: "message",
  });
}

export function startStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "up", "-d"),
    { superuser: "try", err: "message" },
  );
}

export function stopStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "stop"),
    { superuser: "try", err: "message" },
  );
}

export function restartStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "restart"),
    { superuser: "try", err: "message" },
  );
}

export function streamLogs(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "logs", "--follow", "--tail", "200", "--timestamps"),
    { err: "message" },
  );
}

export function downStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "-f", configFile, "down"),
    { superuser: "try", err: "message" },
  );
}

export function pullStack(project: string, configFile: string): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  return cockpit.spawn(
    compose("--progress", "plain", "-p", project, "-f", configFile, "pull"),
    { superuser: "try", err: "out" },
  );
}
