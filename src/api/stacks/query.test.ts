import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { setRuntime, detectComposeCommand } from "../cockpit";
import {
  groupPodmanContainers, listStacks, readRunningServiceNames, streamLogs, streamEvents,
  composeTop, listImages, listVolumes, composeVersion, containerVersion,
  listProjectContainerImageRefs, listImagesByRepo, listAllContainerImages,
  listStoppedContainers, listDanglingVolumes, listProjectNetworks,
  listNetworkConnectedProjects, inspectNetworkContainerCounts,
} from "./query";

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockReturnValue(mockProcess(""));
  setRuntime("docker");
});

async function forcePodmanLimitedBackend(): Promise<void> {
  const mockUser = () => Promise.resolve({ id: 1000 });
  vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
  mockSpawn
    .mockRejectedValueOnce(new Error("no socket"))
    .mockRejectedValueOnce(new Error("no socket"))
    .mockRejectedValueOnce(new Error("not found"))
    .mockResolvedValueOnce("")
    .mockRejectedValueOnce(new Error("unknown flag"));
  setRuntime("podman");
  await detectComposeCommand();
  mockSpawn.mockReset();
  vi.stubGlobal("cockpit", { spawn: mockSpawn });
}

describe("listStacks", () => {
  it("docker mode: runs compose ls", () => {
    listStacks();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "ls", "--all", "--format", "json"]);
  });

  it("podman mode: falls back to podman ps + groupPodmanContainers, resolving to grouped JSON", async () => {
    setRuntime("podman");
    mockSpawn.mockReturnValue(mockProcess(JSON.stringify([
      { State: "running", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ])));
    const out = await listStacks();
    expect(JSON.parse(out as unknown as string)).toEqual([{ Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" }]);
  });

  it("podman mode: rejects when the underlying ps call fails", async () => {
    setRuntime("podman");
    mockSpawn.mockReturnValue(mockProcess("", "connection refused"));
    await expect(listStacks()).rejects.toThrow();
  });
});

describe("readRunningServiceNames", () => {
  it("returns deduplicated running service names for the project", async () => {
    mockSpawn.mockReturnValue(mockProcess("web\nweb\ncache\n"));
    const names = await readRunningServiceNames("myapp");
    expect(names).toEqual(["web", "cache"]);
  });

  it("returns an empty array when the spawn fails", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "no such project"));
    expect(await readRunningServiceNames("myapp")).toEqual([]);
  });
});

describe("streamLogs", () => {
  it("docker mode: includes --timestamps and merges stderr into stdout", () => {
    streamLogs("myapp", ["/myapp/compose.yml"]);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--timestamps");
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });

  it("filters to a single service when given", () => {
    streamLogs("myapp", ["/myapp/compose.yml"], "web");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args[args.length - 1]).toBe("web");
  });

  it("podman mode: adds PYTHONUNBUFFERED=1 to the environment", () => {
    setRuntime("podman");
    streamLogs("myapp", ["/myapp/compose.yml"]);
    const opts = mockSpawn.mock.calls[0][1] as { environ?: string[] };
    expect(opts.environ).toContain("PYTHONUNBUFFERED=1");
  });
});

describe("streamEvents", () => {
  it("docker mode: uses compose events --json", () => {
    streamEvents("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "events", "--json"]);
  });
});

describe("composeTop", () => {
  it("docker mode: runs compose top", () => {
    composeTop("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "compose", "-p", "myapp", "top"]);
  });

  it("podman mode: falls back to ps + per-container top, joining sections", async () => {
    setRuntime("podman");
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "c1", Labels: { "com.docker.compose.service": "web" } }])))
      .mockImplementationOnce(() => mockProcess("PID CMD\n1 nginx"));
    const out = await composeTop("myapp");
    expect(out).toContain("web");
    expect(out).toContain("nginx");
  });

  it("podman mode: skips a container whose top call fails (not running)", async () => {
    setRuntime("podman");
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "c1", Labels: { "com.docker.compose.service": "web" } }])))
      .mockImplementationOnce(() => mockProcess("", "container not running"));
    const out = await composeTop("myapp");
    expect(out).toBe("");
  });

  it("podman mode: returns empty string when there are no containers", async () => {
    setRuntime("podman");
    mockSpawn.mockReturnValueOnce(mockProcess("[]"));
    const out = await composeTop("myapp");
    expect(out).toBe("");
  });
});

describe("listImages / listVolumes", () => {
  it("docker mode: runs compose images / compose volumes", () => {
    listImages("myapp", ["/myapp/compose.yml"]);
    expect((mockSpawn.mock.calls[0][0] as string[])).toContain("images");
    listVolumes("myapp", ["/myapp/compose.yml"]);
    expect((mockSpawn.mock.calls[1][0] as string[])).toContain("volumes");
  });

  it("podman limited-backend mode: listImages falls back to ps + image inspect", async () => {
    await forcePodmanLimitedBackend();
    mockSpawn
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ ImageID: "sha256:abc123", Names: ["myapp_web_1"] }])))
      .mockImplementationOnce(() => mockProcess(JSON.stringify([{ Id: "sha256:abc123", RepoTags: ["nginx:alpine"], Size: 100, Created: "2024-01-01" }])));
    const out = await listImages("myapp", ["/myapp/compose.yml"]);
    const parsed = JSON.parse(out as unknown as string);
    expect(parsed[0]).toMatchObject({ ID: "abc123", Repository: "nginx", Tag: "alpine", ContainerName: "myapp_web_1" });
  });

  it("podman limited-backend mode: listVolumes falls back to volume ls", async () => {
    await forcePodmanLimitedBackend();
    mockSpawn.mockReturnValueOnce(mockProcess(JSON.stringify([{ Name: "pgdata", Driver: "local", Mountpoint: "/var/lib/data" }])));
    const out = await listVolumes("myapp", ["/myapp/compose.yml"]);
    expect(JSON.parse(out as unknown as string)).toEqual([{ Name: "pgdata", Driver: "local", Mountpoint: "/var/lib/data" }]);
  });
});

describe("composeVersion / containerVersion", () => {
  it("uses --format json when the backend is not limited", () => {
    composeVersion();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--format");
    expect(args).toContain("json");
  });

  it("omits --format json for a limited backend", async () => {
    await forcePodmanLimitedBackend();
    composeVersion();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("json");
  });

  it("containerVersion queries the client version", () => {
    containerVersion();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "version", "--format", "{{.Client.Version}}"]);
  });
});

describe("misc listing helpers", () => {
  it("listProjectContainerImageRefs filters by project label", () => {
    listProjectContainerImageRefs("myapp");
    expect((mockSpawn.mock.calls[0][0] as string[]).join(" ")).toContain("label=com.docker.compose.project=myapp");
  });

  it("listImagesByRepo filters by repo name", () => {
    listImagesByRepo("nginx");
    expect(mockSpawn.mock.calls[0][0] as string[]).toContain("nginx");
  });

  it("listAllContainerImages lists images for every container host-wide", () => {
    listAllContainerImages();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["docker", "ps", "-a", "--format", "{{.Image}}"]);
  });

  it("listStoppedContainers filters exited containers by project", () => {
    listStoppedContainers("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("status=exited");
    expect(args.join(" ")).toContain("label=com.docker.compose.project=myapp");
  });

  it("listDanglingVolumes filters dangling volumes by project", () => {
    listDanglingVolumes("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("dangling=true");
  });

  it("listProjectNetworks filters networks by project label", () => {
    listProjectNetworks("myapp");
    expect((mockSpawn.mock.calls[0][0] as string[]).join(" ")).toContain("network");
  });

  it("listNetworkConnectedProjects uses docker's --format .Label syntax", () => {
    listNetworkConnectedProjects("mynet");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("network=mynet");
    expect(args.join(" ")).toContain(".Label");
  });

  it("listNetworkConnectedProjects uses --format json in podman mode (not the Go template)", async () => {
    // Regression: `{{index .Labels "..."}}` errors on Podman 6.0.1 ("cannot
    // index slice/array with type string") — go through JSON + JS parsing
    // instead, matching every other podman fallback in this file.
    setRuntime("podman");
    mockSpawn.mockReturnValue(mockProcess(JSON.stringify([
      { Labels: { "com.docker.compose.project": "myapp" } },
      { Labels: { "com.docker.compose.project": "otherapp" } },
      { Labels: {} },
    ])));
    const out = await listNetworkConnectedProjects("mynet");
    expect(out).toBe("myapp\notherapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("network=mynet");
    expect(args).toContain("json");
    expect(args.join(" ")).not.toContain("index .Labels");
  });
});

describe("inspectNetworkContainerCounts", () => {
  it("docker mode: returns raw tab-separated name/count output", async () => {
    mockSpawn.mockReturnValue(mockProcess("mynet\t2"));
    const out = await inspectNetworkContainerCounts(["mynet"]);
    expect(out).toBe("mynet\t2");
  });

  it("podman mode: parses JSON network inspect output into name/count lines", async () => {
    setRuntime("podman");
    mockSpawn.mockReturnValue(mockProcess(JSON.stringify([{ name: "mynet", containers: { c1: {}, c2: {} } }])));
    const out = await inspectNetworkContainerCounts(["mynet"]);
    expect(out).toBe("mynet\t2");
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
      { State: "exited", Labels: { "com.docker.compose.project": "myapp", "com.docker.compose.project.config_files": "/myapp/compose.yml" } },
    ]);
    expect(result[0].Status).toBe("exited(1), running(1)");
  });

  it("handles multiple distinct projects", () => {
    const result = groupPodmanContainers([
      { State: "running", Labels: { "com.docker.compose.project": "alpha", "com.docker.compose.project.config_files": "/alpha/compose.yml" } },
      { State: "exited", Labels: { "com.docker.compose.project": "beta", "com.docker.compose.project.config_files": "/beta/compose.yml" } },
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

  // podman-compose (Python) may record a bare relative filename in config_files (whatever was
  // passed on the CLI), unlike docker compose / podman compose v2 which always store an absolute
  // path. Resolving against the working_dir label (also standard) prevents every subsequent
  // action from failing with "missing files" once the process's cwd doesn't match.
  it("resolves a relative config_files entry against the working_dir label", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "gotify",
          "com.docker.compose.project.config_files": "docker-compose.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/gotify",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/home/test/testcompose/gotify/docker-compose.yml");
  });

  it("resolves multiple comma-separated relative config_files entries", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml,overrides.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/myapp",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe(
      "/home/test/testcompose/myapp/docker-compose.yml,/home/test/testcompose/myapp/overrides.yml",
    );
  });

  it("leaves an already-absolute config_files entry untouched even with a working_dir label present", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "/myapp/compose.yml",
          "com.docker.compose.project.working_dir": "/somewhere/else",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/myapp/compose.yml");
  });

  it("leaves a relative config_files entry as-is when no working_dir label is present", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("docker-compose.yml");
  });

  it("strips a trailing slash from working_dir before joining", () => {
    const result = groupPodmanContainers([
      {
        State: "running",
        Labels: {
          "com.docker.compose.project": "myapp",
          "com.docker.compose.project.config_files": "docker-compose.yml",
          "com.docker.compose.project.working_dir": "/home/test/testcompose/myapp/",
        },
      },
    ]);
    expect(result[0].ConfigFiles).toBe("/home/test/testcompose/myapp/docker-compose.yml");
  });
});

// Regression for #259: `ps --format {{index .Labels "..."}}` errors on Podman
// 6.0.1 ("cannot index slice/array with type string"), which broke Stack
// Info's entire Networks section. Go through --format json + JS parsing for
// the podman branch instead, matching every other podman fallback in this file.
describe("listNetworkConnectedProjects", () => {
  it("docker mode: uses the --format .Label syntax", () => {
    listNetworkConnectedProjects("mynet");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("network=mynet");
    expect(args.join(" ")).toContain(".Label");
  });

  it("podman mode: uses --format json (not the Go template) and parses labels in JS", async () => {
    setRuntime("podman");
    mockSpawn.mockReturnValue(mockProcess(JSON.stringify([
      { Labels: { "com.docker.compose.project": "myapp" } },
      { Labels: { "com.docker.compose.project": "otherapp" } },
      { Labels: {} },
    ])));
    const out = await listNetworkConnectedProjects("mynet");
    expect(out).toBe("myapp\notherapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args.join(" ")).toContain("network=mynet");
    expect(args).toContain("json");
    expect(args.join(" ")).not.toContain("index .Labels");
  });
});
