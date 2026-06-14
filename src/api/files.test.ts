import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

const mockReplace = vi.fn().mockResolvedValue(undefined);
const mockRead = vi.fn();
const mockFileHandle = { replace: mockReplace, read: mockRead };
const mockCockpitFile = vi.fn().mockReturnValue(mockFileHandle);

beforeEach(() => {
  mockSpawn.mockReset();
  mockReplace.mockReset().mockResolvedValue(undefined);
  mockRead.mockReset();
  mockCockpitFile.mockReset().mockReturnValue(mockFileHandle);
  vi.stubGlobal("cockpit", { spawn: mockSpawn, file: mockCockpitFile });
});

describe("readComposeFile", () => {
  it("spawns cat on the given path", async () => {
    const { readComposeFile } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("content"));
    readComposeFile("/path/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["cat", "/path/compose.yml"]);
  });
});

describe("saveComposeFile", () => {
  it("calls cockpit.file().replace() without superuser when not provided", async () => {
    const { saveComposeFile } = await import("./files");
    await saveComposeFile("/path/compose.yml", "services:\n  web:\n");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/compose.yml", { superuser: undefined });
    expect(mockReplace).toHaveBeenCalledWith("services:\n  web:\n");
  });

  it("passes superuser: try when provided", async () => {
    const { saveComposeFile } = await import("./files");
    await saveComposeFile("/path/compose.yml", "services:\n  web:\n", "try");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/compose.yml", { superuser: "try" });
  });
});

describe("saveSnapshot", () => {
  it("writes snapshot file with timestamp suffix and returns Snapshot", async () => {
    const { saveSnapshot } = await import("./files");
    const before = Date.now();
    const snap = await saveSnapshot("/path/compose.yml", "content");
    const after = Date.now();
    expect(snap.path).toMatch(/\/path\/compose\.yml\.snapshot\.\d+/);
    expect(snap.timestamp).toBeGreaterThanOrEqual(before);
    expect(snap.timestamp).toBeLessThanOrEqual(after);
    expect(snap.name).toBeTruthy();
    expect(mockReplace).toHaveBeenCalledWith("content");
  });
});

describe("listSnapshots", () => {
  it("spawns find in the directory for .snapshot.* files", async () => {
    const { listSnapshots } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    listSnapshots("/path/to/compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/path/to");
    expect(args.some(a => a.includes("compose.yml.snapshot.*"))).toBe(true);
  });
});

describe("restoreSnapshot", () => {
  it("returns the content of the snapshot file", async () => {
    const { restoreSnapshot } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("restored content"));
    const content = await restoreSnapshot("/path/compose.yml.snapshot.123");
    expect(content).toBe("restored content");
  });
});

describe("deleteSnapshot", () => {
  it("spawns rm on the snapshot path", async () => {
    const { deleteSnapshot } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await deleteSnapshot("/path/compose.yml.snapshot.123");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["rm", "/path/compose.yml.snapshot.123"]);
  });
});

describe("findComposeFiles", () => {
  it("spawns find with maxdepth 2 on the given directory", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/etc/docker/compose");
    expect(args).toContain("-maxdepth");
    expect(args).toContain("2");
    expect(args).toContain("compose.yml");
    expect(args).toContain("docker-compose.yml");
  });

  it("passes no superuser by default", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBeUndefined();
  });

  it("passes superuser: try when provided", async () => {
    const { findComposeFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findComposeFiles("/etc/docker/compose", 2, "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("listYamlFilesInDir", () => {
  it("spawns find with -maxdepth 1 for *.yml and *.yaml", async () => {
    const { listYamlFilesInDir } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    listYamlFilesInDir("/etc/docker/compose/myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/etc/docker/compose/myapp");
    expect(args).toContain("-maxdepth");
    expect(args).toContain("1");
    expect(args).toContain("*.yml");
    expect(args).toContain("*.yaml");
  });

  it("passes superuser: try when provided", async () => {
    const { listYamlFilesInDir } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    listYamlFilesInDir("/dir", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("findBackupArchives", () => {
  it("spawns find with -maxdepth 1 and *.bak.tar.gz", async () => {
    const { findBackupArchives } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findBackupArchives("/home/user/stacks");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/home/user/stacks");
    expect(args).toContain("-maxdepth");
    expect(args).toContain("1");
    expect(args).toContain("*.bak.tar.gz");
  });

  it("passes superuser: try when provided", async () => {
    const { findBackupArchives } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findBackupArchives("/dir", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("listArchiveContents", () => {
  it("spawns tar -tzf on the archive path", async () => {
    const { listArchiveContents } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("myapp/\nmyapp/docker-compose.yml\n"));
    listArchiveContents("/backups/myapp-2026.bak.tar.gz");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["tar", "-tzf", "/backups/myapp-2026.bak.tar.gz"]);
  });
});

describe("extractArchive", () => {
  it("spawns tar -xzf with -C for the target parent dir", async () => {
    const { extractArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    extractArchive("/backups/myapp-2026.bak.tar.gz", "/home/user/stacks");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["tar", "-xzf", "/backups/myapp-2026.bak.tar.gz", "-C", "/home/user/stacks"]);
  });
});

describe("readFileFromArchive", () => {
  it("spawns tar -xzOf with archive and member path", async () => {
    const { readFileFromArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("name: myapp\nservices:\n"));
    readFileFromArchive("/backups/myapp-2026.bak.tar.gz", "myapp/docker-compose.yml");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["tar", "-xzOf", "/backups/myapp-2026.bak.tar.gz", "myapp/docker-compose.yml"]);
  });
});

describe("createBackupArchive", () => {
  it("includes basic tar -czf args with -C and dir name", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/backups/myapp-2026.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: true,
    });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("tar");
    expect(args).toContain("-czf");
    expect(args).toContain("/backups/myapp-2026.bak.tar.gz");
    expect(args).toContain("-C");
    expect(args).toContain("/home/user/stacks");
    expect(args[args.length - 1]).toBe("myapp");
  });

  it("excludes snapshots when includeSnapshots is false", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: false,
      includeSubdirs: true,
    });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--exclude=*.snapshot.*");
  });

  it("includes --wildcards before --exclude=*.snapshot.* when includeSnapshots is false", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: false,
      includeSubdirs: true,
    });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("--wildcards");
    expect(args.indexOf("--wildcards")).toBeLessThan(args.indexOf("--exclude=*.snapshot.*"));
  });

  it("does not exclude snapshots when includeSnapshots is true", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: true,
    });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("--exclude=*.snapshot.*");
  });

  it("runs find to discover subdirs and excludes each by exact name when includeSubdirs is false", async () => {
    const { createBackupArchive } = await import("./files");
    // First call = find (returns two subdirs); second call = tar.
    mockSpawn
      .mockReturnValueOnce(mockProcess("/home/user/stacks/myapp/data\n/home/user/stacks/myapp/logs\n"))
      .mockReturnValueOnce(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: false,
    });
    const findArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(findArgs[0]).toBe("find");
    expect(findArgs).toContain("/home/user/stacks/myapp");
    expect(findArgs).toContain("-type");
    expect(findArgs).toContain("d");

    const tarArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(tarArgs).toContain("--exclude=myapp/data");
    expect(tarArgs).toContain("--exclude=myapp/logs");
    expect(tarArgs).not.toContain("--wildcards");
    expect(tarArgs[tarArgs.length - 1]).toBe("myapp");
  });

  it("does not add --exclude args for subdirs when find returns nothing", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn
      .mockReturnValueOnce(mockProcess(""))   // find: no subdirs
      .mockReturnValueOnce(mockProcess(""));  // tar
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: false,
    });
    const tarArgs = mockSpawn.mock.calls[1][0] as string[];
    expect(tarArgs.every(a => !a.startsWith("--exclude=myapp"))).toBe(true);
  });

  it("does not run find and does not add subdir excludes when includeSubdirs is true", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: true,
    });
    // Only one spawn call (tar), no find.
    expect(mockSpawn).toHaveBeenCalledOnce();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args[0]).toBe("tar");
    expect(args.every(a => !a.startsWith("--exclude=myapp"))).toBe(true);
  });

  it("does not include --wildcards when both options are true", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/home/user/stacks", "myapp", "/dest.bak.tar.gz", {
      includeSnapshots: true,
      includeSubdirs: true,
    });
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).not.toContain("--wildcards");
  });

  it("passes superuser: try when provided", async () => {
    const { createBackupArchive } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    await createBackupArchive("/p", "d", "/dest.bak.tar.gz", { includeSnapshots: true, includeSubdirs: true }, "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("readAllProfiles", () => {
  it("returns profiles parsed from the compose file", async () => {
    const { readAllProfiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("services:\n  svc:\n    image: alpine\n    profiles: [dev]\n"));
    const profiles = await readAllProfiles("/path/compose.yml");
    expect(profiles).toEqual(["dev"]);
  });

  it("returns empty array when spawn rejects", async () => {
    const { readAllProfiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const profiles = await readAllProfiles("/path/compose.yml");
    expect(profiles).toEqual([]);
  });

  it("returns empty array when compose file has no profiles", async () => {
    const { readAllProfiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("services:\n  web:\n    image: nginx\n"));
    const profiles = await readAllProfiles("/path/compose.yml");
    expect(profiles).toEqual([]);
  });
});

describe("readEnvFile", () => {
  it("returns content and exists:true when file content is non-null", async () => {
    const { readEnvFile } = await import("./files");
    mockRead.mockResolvedValue("KEY=value\n");
    const result = await readEnvFile("/path/.env");
    expect(result).toEqual({ content: "KEY=value\n", exists: true });
  });

  it("returns empty content and exists:false when cockpit.file returns null", async () => {
    const { readEnvFile } = await import("./files");
    mockRead.mockResolvedValue(null);
    const result = await readEnvFile("/path/.env");
    expect(result).toEqual({ content: "", exists: false });
  });

  it("passes superuser option to cockpit.file", async () => {
    const { readEnvFile } = await import("./files");
    mockRead.mockResolvedValue("K=V");
    await readEnvFile("/path/.env", "try");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/.env", { superuser: "try" });
  });
});

describe("saveEnvFile", () => {
  it("calls cockpit.file().replace() with the given content", async () => {
    const { saveEnvFile } = await import("./files");
    await saveEnvFile("/path/.env", "KEY=value\n");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/.env", { superuser: undefined });
    expect(mockReplace).toHaveBeenCalledWith("KEY=value\n");
  });

  it("passes superuser: try when provided", async () => {
    const { saveEnvFile } = await import("./files");
    await saveEnvFile("/path/.env", "K=V", "try");
    expect(mockCockpitFile).toHaveBeenCalledWith("/path/.env", { superuser: "try" });
  });
});

describe("findEnvFiles", () => {
  it("spawns find for .env, .env.*, and *.env files", async () => {
    const { findEnvFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findEnvFiles("/path/myapp");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("find");
    expect(args).toContain("/path/myapp");
    expect(args).toContain(".env");
    expect(args).toContain(".env.*");
    expect(args).toContain("*.env");
  });

  it("passes superuser: try when provided", async () => {
    const { findEnvFiles } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    findEnvFiles("/dir", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("createDirectory", () => {
  it("spawns mkdir -p -- <path>", async () => {
    const { createDirectory } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    createDirectory("/path/newdir");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["mkdir", "-p", "--", "/path/newdir"]);
  });

  it("passes superuser: try when provided", async () => {
    const { createDirectory } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    createDirectory("/path/newdir", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("makeTempDir", () => {
  it("spawns mktemp -d", async () => {
    const { makeTempDir } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess("/tmp/tmp.abc123\n"));
    makeTempDir();
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["mktemp", "-d"]);
  });
});

describe("fetchComposeFromGit", () => {
  it("spawns git clone with --depth 1 and target tmpdir", async () => {
    const { fetchComposeFromGit } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    fetchComposeFromGit("https://example.com/repo.git", "/tmp/tmp.abc123");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("git");
    expect(args).toContain("clone");
    expect(args).toContain("--depth");
    expect(args).toContain("1");
    expect(args).toContain("--no-local");
    expect(args).toContain("https://example.com/repo.git");
    expect(args).toContain("/tmp/tmp.abc123");
  });

  it("uses err: out to capture stderr progress output", async () => {
    const { fetchComposeFromGit } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    fetchComposeFromGit("https://example.com/repo.git", "/tmp/tmp.abc123");
    const opts = mockSpawn.mock.calls[0][1] as { err: string };
    expect(opts.err).toBe("out");
  });
});

describe("removeDirectory", () => {
  it("spawns rm -rf -- <path>", async () => {
    const { removeDirectory } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    removeDirectory("/tmp/tmp.abc123");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["rm", "-rf", "--", "/tmp/tmp.abc123"]);
  });

  it("passes superuser: try when provided", async () => {
    const { removeDirectory } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    removeDirectory("/tmp/tmp.abc123", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});

describe("removeFile", () => {
  it("spawns rm -- <path>", async () => {
    const { removeFile } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    removeFile("/path/file.txt");
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toEqual(["rm", "--", "/path/file.txt"]);
  });

  it("passes superuser: try when provided", async () => {
    const { removeFile } = await import("./files");
    mockSpawn.mockReturnValue(mockProcess(""));
    removeFile("/path/file.txt", "try");
    const opts = mockSpawn.mock.calls[0][1] as { superuser?: string };
    expect(opts.superuser).toBe("try");
  });
});
