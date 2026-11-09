import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

vi.mock("./files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./files")>();
  return { ...actual, saveComposeFile: vi.fn(), readComposeFile: vi.fn(), findComposeFiles: vi.fn(), extractArchive: vi.fn() };
});

import { saveComposeFile, readComposeFile, findComposeFiles, extractArchive } from "./files";
import { restoreBackup, RestoreError, type RestoreRequest } from "./restore";

const TMP = "/tmp/restore-x";
const req: RestoreRequest = {
  archive: "/srv/stacks/app.bak.tar.gz", targetDir: "/srv/stacks/", rootDir: "app", name: "app-restored", overwrite: false,
};
const calls = () => mockSpawn.mock.calls.map(c => c[0] as string[]);

// Which paths exist, and which commands fail.
let existing: Set<string>;
let failing: (argv: string[]) => string | null;

beforeEach(() => {
  mockSpawn.mockReset();
  vi.mocked(saveComposeFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(extractArchive).mockReset().mockResolvedValue(undefined);
  vi.mocked(findComposeFiles).mockReset().mockImplementation(() => mockProcess("/srv/stacks/app-restored/compose.yml\n"));
  vi.mocked(readComposeFile).mockReset().mockImplementation(() => mockProcess("name: app\nservices: {}\n"));
  existing = new Set([`${TMP}/app`]);
  failing = () => null;
  mockSpawn.mockImplementation((argv: string[]) => {
    const err = failing(argv);
    if (err) return mockProcess("", err);
    if (argv[0] === "mktemp") return mockProcess(`${TMP}\n`);
    if (argv[0] === "ls") return existing.has(argv[argv.length - 1]) ? mockProcess("ok") : mockProcess("", "No such file");
    return mockProcess("");
  });
});

describe("restoreBackup under the same name", () => {
  it("extracts straight into the target directory and returns the compose files", async () => {
    const out = await restoreBackup({ ...req, name: "app" });
    expect(extractArchive).toHaveBeenCalledWith(req.archive, "/srv/stacks", "try");
    expect(out.path).toBe("/srv/stacks/app");
    expect(out.configFiles).toEqual(["/srv/stacks/app-restored/compose.yml"]);
    expect(saveComposeFile).not.toHaveBeenCalled();
  });
});

describe("restoreBackup under a new name", () => {
  it("extracts into a temp dir, never the live parent, and moves the folder into place", async () => {
    await restoreBackup(req);
    expect(extractArchive).toHaveBeenCalledWith(req.archive, TMP);
    expect(extractArchive).not.toHaveBeenCalledWith(expect.anything(), "/srv/stacks", expect.anything());
    expect(calls()).toContainEqual(["mv", "--", `${TMP}/app`, "/srv/stacks/app-restored"]);
    expect(calls()).toContainEqual(["rm", "-rf", "--", TMP]);
  });

  it("rewrites the compose name: to the new name", async () => {
    await restoreBackup(req);
    expect(saveComposeFile).toHaveBeenCalledWith("/srv/stacks/app-restored/compose.yml", "name: app-restored\nservices: {}\n");
  });

  it("leaves a compose file without a name: alone", async () => {
    vi.mocked(readComposeFile).mockImplementation(() => mockProcess("services: {}\n"));
    await restoreBackup(req);
    expect(saveComposeFile).not.toHaveBeenCalled();
  });

  it("prefers compose.yaml over docker-compose.yml when rewriting the name", async () => {
    vi.mocked(findComposeFiles).mockImplementation(() => mockProcess("/d/docker-compose.yml\n/d/compose.yaml\n"));
    await restoreBackup(req);
    expect(readComposeFile).toHaveBeenCalledWith("/d/compose.yaml");
  });

  it("fails with src_missing when the archive lacks its root folder", async () => {
    existing.clear();
    await expect(restoreBackup(req)).rejects.toMatchObject({ code: "src_missing", path: "/srv/stacks/app" });
    expect(calls()).toContainEqual(["rm", "-rf", "--", TMP]);
  });

  it("refuses to replace an existing target without overwrite, and removes the temp dir", async () => {
    existing.add("/srv/stacks/app-restored");
    const err = await restoreBackup(req).catch(e => e);
    expect(err).toBeInstanceOf(RestoreError);
    expect(err).toMatchObject({ code: "dest_exists", path: "/srv/stacks/app-restored" });
    expect(calls().some(a => a[0] === "mv")).toBe(false);
    expect(calls()).toContainEqual(["rm", "-rf", "--", TMP]);
  });

  describe("with overwrite", () => {
    const isDisplaced = (p: string | undefined) => (p ?? "").startsWith("/srv/stacks/app-restored.restore-displaced-");

    beforeEach(() => { existing.add("/srv/stacks/app-restored"); });

    it("moves the old folder aside, moves the new one in, and only then removes the old", async () => {
      await restoreBackup({ ...req, overwrite: true });
      const c = calls();
      const displace = c.findIndex(a => a[0] === "mv" && a[2] === "/srv/stacks/app-restored" && isDisplaced(a[3]));
      const moveIn = c.findIndex(a => a[0] === "mv" && a[2] === `${TMP}/app` && a[3] === "/srv/stacks/app-restored");
      const removeOld = c.findIndex(a => a[0] === "rm" && isDisplaced(a[3]));
      expect(displace).toBeGreaterThan(-1);
      expect(moveIn).toBeGreaterThan(displace);
      expect(removeOld).toBeGreaterThan(moveIn);
    });

    it("puts the original folder back and keeps it if moving the new one in fails", async () => {
      failing = argv => (argv[0] === "mv" && argv[2] === `${TMP}/app` ? "mv: cannot move" : null);
      await expect(restoreBackup({ ...req, overwrite: true })).rejects.toThrow(/cannot move/);
      const c = calls();
      expect(c.some(a => a[0] === "mv" && isDisplaced(a[2]) && a[3] === "/srv/stacks/app-restored")).toBe(true);
      expect(c.some(a => a[0] === "rm" && isDisplaced(a[3]))).toBe(false);
      expect(saveComposeFile).not.toHaveBeenCalled();
    });
  });
});
