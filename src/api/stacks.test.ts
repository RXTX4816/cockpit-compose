import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import {
  listStacks, startStack, stopStack, restartStack, streamLogs, downStack, pullStack,
  listProjectContainerImageRefs, listImagesByRepo, listAllContainerImages, removeImages,
  listStoppedContainers, listDanglingVolumes, listProjectNetworks,
  pruneContainers, pruneVolumes, pruneNetworks, composeRunStream,
} from "./stacks";

beforeEach(() => { mockSpawn.mockReset(); });

describe("listStacks", () => {
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

describe("startStack", () => {
  it("spawns compose up -d with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    startStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
    expect(args).toContain("up");
    expect(args).toContain("-d");
  });
});

describe("stopStack", () => {
  it("spawns compose stop with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    stopStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("stop");
    expect(args).toContain("myapp");
  });
});

describe("restartStack", () => {
  it("spawns compose restart with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    restartStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("restart");
  });
});

describe("streamLogs", () => {
  it("spawns compose logs --follow with timestamps", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    streamLogs("myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("logs");
    expect(args).toContain("--follow");
    expect(args).toContain("--timestamps");
  });
});

describe("downStack", () => {
  it("spawns compose down with project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    downStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("down");
    expect(args).toContain("myapp");
  });
});

describe("pullStack", () => {
  it("spawns compose pull with plain progress", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", "/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("pull");
    expect(args).toContain("--progress");
    expect(args).toContain("plain");
  });

  it("merges stderr into stdout (err: out)", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    pullStack("myapp", "/path/compose.yml");
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
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
    composeRunStream("myapp", "/path/compose.yml", "web", ["echo", "hello"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("run");
    expect(args).toContain("web");
    expect(args).toContain("echo");
    expect(args).toContain("hello");
  });

  it("includes --rm when rm is true", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", "/path/compose.yml", "web", ["sh"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--rm");
  });

  it("omits --rm when rm is false", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", "/path/compose.yml", "web", ["sh"], false);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("--rm");
  });

  it("passes project and config file", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", "/path/compose.yml", "web", ["sh"], true);
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("-p");
    expect(args).toContain("myapp");
    expect(args).toContain("-f");
    expect(args).toContain("/path/compose.yml");
  });

  it("merges stderr into stdout with err: out", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", "/path/compose.yml", "web", ["sh"], true);
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.err).toBe("out");
  });

  it("passes superuser option when provided", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    composeRunStream("myapp", "/path/compose.yml", "web", ["sh"], true, "try");
    const opts = mockSpawn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.superuser).toBe("try");
  });
});
