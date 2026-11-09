import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

vi.mock("./files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./files")>();
  return { ...actual, saveComposeFile: vi.fn(), saveSnapshot: vi.fn(), createDirectory: vi.fn() };
});

import { saveComposeFile, saveSnapshot, createDirectory } from "./files";
import { saveStackFile, addStackFile, createStackFiles } from "./stackFiles";

const replace = vi.fn();

beforeEach(() => {
  mockSpawn.mockReset().mockImplementation(() => mockProcess("1000\n"));
  replace.mockReset().mockResolvedValue(undefined);
  vi.mocked(saveComposeFile).mockReset().mockResolvedValue(undefined);
  vi.mocked(saveSnapshot).mockReset().mockResolvedValue({ timestamp: 1, name: "n", path: "p" });
  vi.mocked(createDirectory).mockReset().mockImplementation(() => mockProcess(""));
  vi.stubGlobal("cockpit", {
    spawn: mockSpawn,
    file: vi.fn().mockReturnValue({ replace }),
    user: vi.fn().mockResolvedValue({ id: 1000, name: "u", home: "/home/u" }),
  });
});

describe("stack file writes decide their own escalation", () => {
  it("saveStackFile snapshots the old content, then writes the new, with the same escalation", async () => {
    await saveStackFile("/srv/a/compose.yml", "old", "new");
    expect(saveSnapshot).toHaveBeenCalledWith("/srv/a/compose.yml", "old", undefined);
    expect(saveComposeFile).toHaveBeenCalledWith("/srv/a/compose.yml", "new", undefined);
  });

  it("escalates when the files belong to someone else", async () => {
    mockSpawn.mockImplementation(() => mockProcess("0\n"));
    await saveStackFile("/srv/a/compose.yml", "old", "new");
    expect(saveComposeFile).toHaveBeenCalledWith("/srv/a/compose.yml", "new", "try");
  });

  it("addStackFile writes the new file", async () => {
    await addStackFile(["/srv/a/compose.yml"], "/srv/a/override.yml", "x");
    expect(saveComposeFile).toHaveBeenCalledWith("/srv/a/override.yml", "x", undefined);
  });

  it("createStackFiles creates the directory and writes every file", async () => {
    await createStackFiles("/srv/new", [{ path: "/srv/new/compose.yml", content: "a" }, { path: "/srv/new/x.yml", content: "b" }]);
    expect(createDirectory).toHaveBeenCalledWith("/srv/new", undefined);
    expect(replace.mock.calls.map(c => c[0])).toEqual(["a", "b"]);
  });
});
