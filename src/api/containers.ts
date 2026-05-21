import { compose } from "./cockpit";

export function listContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    compose("-p", project, "ps", "--all", "--format", "json"),
    { err: "message" },
  );
}

export function getContainerStats(containerIds: string[]): CockpitProcess {
  return cockpit.spawn(
    [
      "docker", "stats", "--no-stream",
      "--format",
      '{"id":"{{.ID}}","name":"{{.Name}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}","memPerc":"{{.MemPerc}}","net":"{{.NetIO}}","block":"{{.BlockIO}}"}',
      ...containerIds,
    ],
    { err: "message" },
  );
}
