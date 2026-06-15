import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import {
  listStacks, groupPodmanContainers, startStack, stopStack, restartStack, streamLogs, downStack, upStackStream, pullStack,
  listProjectContainerImageRefs, listImagesByRepo, listAllContainerImages, removeImages,
  listStoppedContainers, listDanglingVolumes, listProjectNetworks,
  pruneContainers, pruneVolumes, pruneNetworks, composeRunStream,
  readRunningServiceNames, pauseStack, unpauseStack, killStack,
  streamEvents, composeTop, composeVersion, listImages, listVolumes,
  listNetworkConnectedProjects, inspectNetworkContainerCounts,
} from "./stacks";

beforeEach(() => { mockSpawn.mockReset(); vi.resetModules(); });

describe("listStacks [docker]", () => {
  it("spawns compose ls --all --format json", () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    listStacks();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ls");
    expect(args).toContain("--all");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });
});

describe("listStacks [podman]", () => {
  it("spawns podman ps with compose label filter and emits grouped JSON", async () => {
    const podmanPsOutput = JSON.stringify([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/home/user/myapp/compose.yml" } },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/home/user/myapp/compose.yml" } },
      { State: "exited",  Labels: { "com.docker.compose.project": "other",  "com.docker.compose.project.config_files": "/home/user/other/compose.yml" } },
    ]);
    // mockImplementation (not mockReturnValue) so mockProcess is created lazily when spawn is
    // called — avoids a race where the queueMicrotask fires before proc.stream() is registered.
    mockSpawn.mockImplementation(() => mockProcess(podmanPsOutput));

    const { listStacks: ls } = await import("./stacks");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");

    let received = "";
    const proc = ls();
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { Name: string; Status: string; ConfigFiles: string }[];
    expect(result).toHaveLength(2);
    const myapp = result.find(r => r.Name === "myapp")!;
    expect(myapp.Status).toBe("running(2)");
    expect(myapp.ConfigFiles).toBe("/home/user/myapp/compose.yml");
    const other = result.find(r => r.Name === "other")!;
    expect(other.Status).toBe("exited(1)");

    const spawnArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(spawnArgs).toContain("ps");
    expect(spawnArgs).toContain("--filter");
    expect(spawnArgs).toContain("label=com.docker.compose.project");
    expect(spawnArgs).toContain("--format");
    expect(spawnArgs).toContain("json");
  });

  it("rejects when podman ps fails", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "permission denied"));
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    const { listStacks: ls } = await import("./stacks");
    await expect(ls()).rejects.toThrow();
  });

  it("returns empty array when no compose containers exist", async () => {
    mockSpawn.mockImplementation(() => mockProcess("[]"));
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    const { listStacks: ls } = await import("./stacks");
    let received = "";
    const proc = ls();
    proc.stream(d => { received += d; });
    await proc;
    expect(JSON.parse(received)).toEqual([]);
  });
});

describe("groupPodmanContainers", () => {
  it("groups single-container project", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toEqual([{ Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" }]);
  });

  it("groups multi-container project into single entry", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].Status).toBe("running(2)");
  });

  it("produces mixed status when containers have different states", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
      { State: "exited",  Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result[0].Status).toBe("exited(1), running(1)");
  });

  it("handles multiple distinct projects", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "alpha", "com.docker.compose.project.config_files": "/alpha/compose.yml" } },
      { State: "exited",  Labels: { "com.docker.compose.project": "beta",  "com.docker.compose.project.config_files": "/beta/compose.yml" } },
    ]);
    expect(result).toHaveLength(2);
    expect(result.find(r => r.Name === "alpha")?.Status).toBe("running(1)");
    expect(result.find(r => r.Name === "beta")?.Status).toBe("exited(1)");
  });

  it("skips containers without the project label", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: {} },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe("myapp");
  });

  it("returns empty array for empty input", () => {
    expect(groupPodmanContainers([])).toEqual([]);
  });

  it("uses config_files from the first container seen for a project", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/first/compose.yml" } },
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/first/compose.yml" } },
    ]);
    expect(result[0].ConfigFiles).toBe("/first/compose.yml");
  });
});

describe("startStack", () => {
  it("spawns compose up -d with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    startStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
    expect(args).toContain("up");
    expect(args).toContain("-d");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    startStack("myapp", ["/path/base.yml", "/path/override.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const fFlags = args.filter(a => a === "-f");
    expect(fFlags).toHaveLength(2);
    expect(args).toContain("/path/base.yml");
    expect(args).toContain("/path/override.yml");
  });
});

describe("stopStack", () => {
  it("spawns compose stop with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    stopStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("stop");
    expect(args).toContain("myapp");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    stopStack("myapp", ["/path/base.yml", "/path/override.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.filter(a => a === "-f")).toHaveLength(2);
  });
});

describe("restartStack", () => {
  it("spawns compose restart with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    restartStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("restart");
  });
});

describe("streamLogs", () => {
  it("spawns compose logs --follow with timestamps and file flags", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    streamLogs("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("logs");
    expect(args).toContain("--follow");
    expect(args).toContain("--timestamps");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
  });

  it("passes explicit service names when allServices provided with no service selected", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    streamLogs("myapp", ["/path/compose.yml"], undefined, ["web", "db"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    // For non-limited backend (docker), allServices are ignored — no service args appended
    expect(args).not.toContain("web");
    expect(args).not.toContain("db");
  });
});

describe("downStack", () => {
  it("spawns compose down with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    downStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("down");
    expect(args).toContain("myapp");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    downStack("myapp", ["/path/base.yml", "/path/override.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.filter(a => a === "-f")).toHaveLength(2);
  });
});

describe("upStackStream", () => {
  it("spawns compose up -d with plain progress", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/compose.yml"], []);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("up");
    expect(args).toContain("-d");
    expect(args).toContain("--progress");
    expect(args).toContain("plain");
  });

  it("merges stderr into stdout (err: out)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/compose.yml"], []);
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });

  it("includes no --profile flags when profiles is empty", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/compose.yml"], []);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("--profile");
  });

  it("adds --profile flags before --progress for each selected profile", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/compose.yml"], ["dev", "debug"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const progressIdx = args.indexOf("--progress");
    const firstProfileIdx = args.indexOf("--profile");
    expect(firstProfileIdx).toBeGreaterThanOrEqual(0);
    expect(firstProfileIdx).toBeLessThan(progressIdx);
    expect(args).toContain("dev");
    expect(args).toContain("debug");
  });

  it("emits each profile as a separate --profile flag pair", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/compose.yml"], ["dev", "monitoring"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    const profilePairs: string[] = [];
    for (let i = 0; i < args.length - 1; i++) {
      if (args[i] === "--profile") profilePairs.push(args[i + 1]);
    }
    expect(profilePairs).toContain("dev");
    expect(profilePairs).toContain("monitoring");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    upStackStream("myapp", ["/path/base.yml", "/path/override.yml"], []);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.filter(a => a === "-f")).toHaveLength(2);
    expect(args).toContain("/path/base.yml");
    expect(args).toContain("/path/override.yml");
  });
});

describe("pullStack", () => {
  it("spawns compose pull with plain progress", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("pull");
    expect(args).toContain("--progress");
    expect(args).toContain("plain");
  });

  it("merges stderr into stdout (err: out)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", ["/path/compose.yml"]);
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", ["/path/base.yml", "/path/override.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.filter(a => a === "-f")).toHaveLength(2);
  });
});

describe("listProjectContainerImageRefs", () => {
  it("lists image refs from all project containers by label", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listProjectContainerImageRefs("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args).toContain("-a");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
    expect(args.join(" ")).toContain("{{.Image}}");
  });
});

describe("listImagesByRepo", () => {
  it("lists all images for the given repo with name and size columns", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listImagesByRepo("docker.gitea.com/gitea");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("images");
    expect(args).toContain("docker.gitea.com/gitea");
    expect(args.join(" ")).toContain("{{.Repository}}:{{.Tag}}");
    expect(args.join(" ")).toContain("{{.Size}}");
  });
});

describe("listAllContainerImages", () => {
  it("lists image names for all containers using {{.Image}}", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listAllContainerImages();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args).toContain("-a");
    expect(args.join(" ")).toContain("{{.Image}}");
  });
});

describe("removeImages", () => {
  it("runs docker rmi with the given IDs", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    removeImages(["abc123", "def456"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("rmi");
    expect(args).toContain("abc123");
    expect(args).toContain("def456");
  });
});

describe("listStoppedContainers", () => {
  it("filters stopped containers by compose project label", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listStoppedContainers("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args).toContain("-a");
    expect(args).toContain("status=exited");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("listDanglingVolumes", () => {
  it("filters dangling volumes by compose project label", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listDanglingVolumes("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("volume");
    expect(args).toContain("ls");
    expect(args).toContain("dangling=true");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("listProjectNetworks", () => {
  it("lists networks by compose project label", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listProjectNetworks("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("network");
    expect(args).toContain("ls");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("pruneContainers", () => {
  it("runs docker container prune with project label filter", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pruneContainers("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("container");
    expect(args).toContain("prune");
    expect(args).toContain("-f");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("pruneVolumes", () => {
  it("runs docker volume prune with project label filter", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pruneVolumes("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("volume");
    expect(args).toContain("prune");
    expect(args).toContain("-f");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("pruneNetworks", () => {
  it("runs docker network prune with project label filter", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pruneNetworks("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("network");
    expect(args).toContain("prune");
    expect(args).toContain("-f");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
  });
});

describe("composeRunStream", () => {
  it("spawns compose run with service and command args", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["echo", "hello"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("run");
    expect(args).toContain("web");
    expect(args).toContain("echo");
    expect(args).toContain("hello");
  });

  it("includes --rm when rm is true", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["sh"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--rm");
  });

  it("omits --rm when rm is false", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["sh"], false);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("--rm");
  });

  it("passes project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["sh"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
  });

  it("merges stderr into stdout with err: out", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["sh"], true);
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.err).toBe("out");
  });

  it("passes superuser option when provided", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/compose.yml"], "web", ["sh"], true, "try");
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.superuser).toBe("try");
  });

  it("emits two -f flags for multi-file input", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", ["/path/base.yml", "/path/override.yml"], "web", ["sh"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.filter(a => a === "-f")).toHaveLength(2);
    expect(args).toContain("/path/base.yml");
    expect(args).toContain("/path/override.yml");
  });
});

describe("listImages [podman-compose limited backend]", () => {
  it("falls back to podman ps + image inspect when compose is limited backend", async () => {
    const psOutput = JSON.stringify([
      { ImageID: "sha256:deadbeef1234", Names: ["myapp-web-1"], Labels: { "com.docker.compose.project": "myapp" } },
    ]);
    const inspectOutput = JSON.stringify([
      { Id: "sha256:deadbeef1234", RepoTags: ["docker.io/nginx:alpine"], Size: 12345678, Created: "2024-01-01T00:00:00Z" },
    ]);
    mockSpawn
      .mockImplementationOnce(() => mockProcess(psOutput))    // podman ps
      .mockImplementationOnce(() => mockProcess(inspectOutput)); // podman image inspect

    const { listImages: li } = await import("./stacks");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);

    let received = "";
    const proc = li("myapp", []);
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { ID: string; Repository: string; Tag: string; ContainerName: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].Repository).toBe("docker.io/nginx");
    expect(result[0].Tag).toBe("alpine");
    expect(result[0].ContainerName).toBe("myapp-web-1");

    const psArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(psArgs).toContain("ps");
    expect(psArgs).toContain("-a");
    expect(psArgs.join(" ")).toContain("com.docker.compose.project=myapp");
    expect(psArgs).not.toContain("images");

    const inspectArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(inspectArgs).toContain("image");
    expect(inspectArgs).toContain("inspect");
    expect(inspectArgs).toContain("sha256:deadbeef1234");
  });
});

describe("listVolumes [podman-compose limited backend]", () => {
  it("falls back to podman volume ls when compose is limited backend", async () => {
    const volOutput = JSON.stringify([
      { Name: "myapp_pgdata", Driver: "local", Mountpoint: "/var/lib/containers/storage/volumes/myapp_pgdata/_data" },
    ]);
    mockSpawn.mockImplementation(() => mockProcess(volOutput));

    const { listVolumes: lv } = await import("./stacks");
    const cockpitMod = await import("./cockpit");
    cockpitMod.setRuntime("podman");
    vi.spyOn(cockpitMod, "composeIsLimitedBackend").mockReturnValue(true);

    let received = "";
    const proc = lv("myapp", []);
    proc.stream(d => { received += d; });
    await proc;

    const result = JSON.parse(received) as { Name: string; Driver: string; Mountpoint: string }[];
    expect(result).toHaveLength(1);
    expect(result[0].Name).toBe("myapp_pgdata");
    expect(result[0].Driver).toBe("local");

    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("volume");
    expect(args).toContain("ls");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
    expect(args).not.toContain("volumes");
  });
});

describe("readRunningServiceNames", () => {
  it("returns deduplicated service names from docker ps output", async () => {
    mockSpawn.mockReturnValue(mockProcess("web\nweb\nworker\n"));
    const names = await readRunningServiceNames("myapp");
    expect(names).toEqual(["web", "worker"]);
  });

  it("filters out empty lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("web\n\n"));
    const names = await readRunningServiceNames("myapp");
    expect(names).toEqual(["web"]);
  });

  it("spawns docker ps with correct filters and format", async () => {
    mockSpawn.mockReturnValue(mockProcess("web\n"));
    await readRunningServiceNames("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args.join(" ")).toContain("com.docker.compose.project=myapp");
    expect(args).toContain("status=running");
  });

  it("returns empty array when spawn rejects", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const names = await readRunningServiceNames("myapp");
    expect(names).toEqual([]);
  });
});

describe("pauseStack", () => {
  it("spawns compose pause with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pauseStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("pause");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
  });

  it("passes superuser option when provided", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pauseStack("myapp", ["/path/compose.yml"], [], "try");
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.superuser).toBe("try");
  });
});

describe("unpauseStack", () => {
  it("spawns compose unpause with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    unpauseStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("unpause");
    expect(args).toContain("myapp");
  });

  it("passes superuser option when provided", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    unpauseStack("myapp", ["/path/compose.yml"], [], "try");
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.superuser).toBe("try");
  });
});

describe("killStack", () => {
  it("spawns compose kill with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    killStack("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("kill");
    expect(args).toContain("myapp");
  });

  it("passes superuser option when provided", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    killStack("myapp", ["/path/compose.yml"], [], "try");
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.superuser).toBe("try");
  });
});

describe("streamEvents", () => {
  it("spawns compose events --json for the given project", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    streamEvents("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("events");
    expect(args).toContain("--json");
    expect(args).toContain("myapp");
  });
});

describe("composeTop", () => {
  it("spawns compose top for the given project", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeTop("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("top");
    expect(args).toContain("myapp");
  });
});

describe("composeVersion", () => {
  it("spawns compose version --format json", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeVersion();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("version");
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });
});

describe("listImages", () => {
  it("spawns compose images --format json for the project", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listImages("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("images");
    expect(args).toContain("--format");
    expect(args).toContain("json");
    expect(args).toContain("myapp");
  });
});

describe("listVolumes", () => {
  it("spawns compose volumes --format json for the project", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listVolumes("myapp", ["/path/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("volumes");
    expect(args).toContain("--format");
    expect(args).toContain("json");
    expect(args).toContain("myapp");
  });
});

describe("listNetworkConnectedProjects", () => {
  it("spawns docker ps with network filter and compose project label format", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    listNetworkConnectedProjects("my-network");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("ps");
    expect(args).toContain("network=my-network");
    expect(args.join(" ")).toContain("com.docker.compose.project");
  });
});

describe("inspectNetworkContainerCounts", () => {
  it("spawns network inspect with format template", async () => {
    mockSpawn.mockReturnValue(mockProcess("net1\t2\nnet2\t0"));
    await inspectNetworkContainerCounts(["net1", "net2"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("network");
    expect(args).toContain("inspect");
    expect(args).toContain("net1");
    expect(args).toContain("net2");
  });
});
