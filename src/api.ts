import { load as loadYaml } from "js-yaml";
export { parseDockerBytes, formatBytes } from "./lib/bytes";

export interface ComposeStack {
  Name: string;
  Status: string;
  ConfigFiles: string;
}

export interface ComposeContainer {
  ID: string;
  Name: string;
  Image: string;
  State: string;
  Status: string;
  Ports: string;
  Service: string;
}

export type StackStatus = "running" | "partial" | "down" | "unknown";

export function parseStackStatus(status: string): StackStatus {
  const lower = status.toLowerCase();
  const hasRunning = lower.includes("running");
  const hasExited = lower.includes("exit") || lower.includes("stopped");
  if (hasRunning && !hasExited) return "running";
  if (hasRunning && hasExited) return "partial";
  if (!hasRunning && hasExited) return "down";
  return "unknown";
}

export function parseServiceCount(status: string): number {
  const matches = status.match(/\((\d+)\)/g);
  if (!matches) return 0;
  return matches.reduce((sum, m) => sum + parseInt(m.replace(/[()]/g, ""), 10), 0);
}

// docker compose outputs either a JSON array or JSONL (one object per line)
export function parseJsonOutput<T>(raw: string): T[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed as T];
  } catch {
    return trimmed
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => JSON.parse(l) as T);
  }
}

export function listStacks(): CockpitProcess {
  return cockpit.spawn(["docker", "compose", "ls", "--all", "--format", "json"], {
    err: "message",
  });
}

export function listContainers(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "ps", "--all", "--format", "json"],
    { err: "message" },
  );
}

export function startStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "-f", configFile, "up", "-d"],
    { superuser: "try", err: "message" },
  );
}

export function stopStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "-f", configFile, "stop"],
    { superuser: "try", err: "message" },
  );
}

export function restartStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "-f", configFile, "restart"],
    { superuser: "try", err: "message" },
  );
}

export function streamLogs(project: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "logs", "--follow", "--tail", "200", "--timestamps"],
    { err: "message" },
  );
}

export function readComposeFile(path: string): CockpitProcess {
  return cockpit.spawn(["cat", path], { err: "message" });
}

export async function saveComposeFile(path: string, content: string): Promise<void> {
  const file = cockpit.file(path, { superuser: "try" });
  await file.replace(content);
}

export function getHealthStatus(status: string): "healthy" | "partial" | "unhealthy" {
  const lower = status.toLowerCase();
  const hasRunning = /running\(\d+\)/.test(lower);
  const hasExited = /exit|stopped/.test(lower);
  if (hasRunning && !hasExited) return "healthy";
  if (hasRunning && hasExited) return "partial";
  return "unhealthy";
}

export interface Snapshot {
  timestamp: number;
  name: string;
  path: string;
}

export async function saveSnapshot(composeFilePath: string, content: string): Promise<Snapshot> {
  const timestamp = Date.now();
  const snapshotPath = `${composeFilePath}.snapshot.${timestamp}`;
  const file = cockpit.file(snapshotPath, { superuser: "try" });
  await file.replace(content);
  return {
    timestamp,
    name: new Date(timestamp).toLocaleString(),
    path: snapshotPath,
  };
}

export function listSnapshots(composeFilePath: string): CockpitProcess {
  const dir = composeFilePath.substring(0, composeFilePath.lastIndexOf("/"));
  const filename = composeFilePath.substring(composeFilePath.lastIndexOf("/") + 1);
  return cockpit.spawn(
    ["find", dir, "-maxdepth", "1", "-name", `${filename}.snapshot.*`, "-type", "f"],
    { err: "message" },
  );
}

export async function restoreSnapshot(snapshotPath: string): Promise<string> {
  let content = "";
  const proc = cockpit.spawn(["cat", snapshotPath], { err: "message" });
  proc.stream(data => { content += data; });
  await proc;
  return content;
}

export async function deleteSnapshot(snapshotPath: string): Promise<void> {
  await cockpit.spawn(["rm", snapshotPath], { superuser: "try", err: "message" });
}

export function parsePorts(portsStr: string): string[] {
  if (!portsStr) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of portsStr.split(",")) {
    const m = part.trim().match(/(?:[\d.]+):(\d+)->(\d+)\/\w+/);
    if (m) {
      const label = `${m[1]}→${m[2]}`;
      if (!seen.has(label)) { seen.add(label); result.push(label); }
    }
  }
  return result;
}

export function downStack(project: string, configFile: string): CockpitProcess {
  return cockpit.spawn(
    ["docker", "compose", "-p", project, "-f", configFile, "down"],
    { superuser: "try", err: "message" },
  );
}

export function pullStack(project: string, configFile: string): CockpitProcess {
  // err:"out" merges stderr (where Docker sends progress) into the streamable stdout
  return cockpit.spawn(
    ["docker", "compose", "--progress", "plain", "-p", project, "-f", configFile, "pull"],
    { superuser: "try", err: "out" },
  );
}

export interface ContainerStats {
  id: string;
  name: string;
  cpu: string;
  mem: string;
  memPerc: string;
  net: string;
  block: string;
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

export function getServicesFromCompose(composeContent: string): string[] {
  try {
    const compose = loadYaml(composeContent);
    if (compose && typeof compose === "object" && "services" in compose) {
      const services = (compose as Record<string, unknown>).services;
      if (typeof services === "object" && services !== null) {
        return Object.keys(services);
      }
    }
  } catch {
    // Silently fail if can't parse
  }
  return [];
}

export interface ConfiguredDirectory {
  path: string;
  addedAt: number;
}

export interface FoundCompose {
  path: string;
  services: string[];
}

export async function getConfiguredDirectories(): Promise<ConfiguredDirectory[]> {
  try {
    let content = "";
    const proc = cockpit.spawn(["sh", "-c", `cat "$HOME/.config/cockpit-compose/directories.json"`], {
      err: "message",
    });
    proc.stream(data => { content += data; });
    await proc;
    return JSON.parse(content);
  } catch {
    return [];
  }
}

export async function saveConfiguredDirectories(directories: ConfiguredDirectory[]): Promise<void> {
  const content = JSON.stringify(directories, null, 2);

  // Create directory
  await cockpit.spawn(["sh", "-c", `mkdir -p "$HOME/.config/cockpit-compose"`], {
    superuser: "try",
    err: "message",
  });

  // Write file using tee to handle shell expansion
  const proc = cockpit.spawn(["sh", "-c", `cat > "$HOME/.config/cockpit-compose/directories.json"`], {
    superuser: "try",
    err: "message",
  });
  proc.input(content);
  await proc;
}

async function expandPath(path: string): Promise<string> {
  if (!path.startsWith("~")) {
    return path;
  }
  let expanded = "";
  const proc = cockpit.spawn(["sh", "-c", `echo ~`], { err: "message" });
  proc.stream(data => { expanded += data; });
  await proc;
  const homeDir = expanded.trim();
  return path.replace("~", homeDir);
}

export function findComposeFiles(directory: string): CockpitProcess {
  return cockpit.spawn(
    ["find", directory, "-type", "f", "(", "-name", "docker-compose.yml", "-o", "-name", "docker-compose.yaml", "-o", "-name", "compose.yml", "-o", "-name", "compose.yaml", ")", "-readable"],
    { err: "message" },
  );
}

export async function scanDirectoriesForCompose(directories: ConfiguredDirectory[]): Promise<FoundCompose[]> {
  const found: FoundCompose[] = [];

  for (const dir of directories) {
    try {
      const expandedPath = await expandPath(dir.path);
      let raw = "";
      const proc = findComposeFiles(expandedPath);
      proc.stream(data => { raw += data; });
      try {
        await proc;
      } catch (err) {
        console.error(`Failed to scan directory ${dir.path}:`, err);
        continue;
      }

      const files = raw.trim().split("\n").filter(Boolean);
      for (const file of files) {
        try {
          let content = "";
          const readProc = cockpit.spawn(["cat", file], { err: "message" });
          readProc.stream(data => { content += data; });
          await readProc;

          const services = getServicesFromCompose(content);
          if (services.length > 0) {
            found.push({ path: file, services });
          }
        } catch (err) {
          console.warn(`Failed to read or parse ${file}:`, err);
        }
      }
    } catch (err) {
      console.error(`Error scanning directory ${dir.path}:`, err);
    }
  }

  return found;
}
