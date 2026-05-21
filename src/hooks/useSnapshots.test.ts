import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useSnapshots } from "./useSnapshots";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

const lazy = (data: string, err?: string) => () => mockProcess(data, err);

beforeEach(() => { mockSpawn.mockReset(); });

describe("useSnapshots", () => {
  it("starts with empty snapshots", () => {
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    expect(result.current.snapshots).toEqual([]);
  });

  it("load() parses snapshot paths into Snapshot objects", async () => {
    const ts = 1700000000000;
    mockSpawn.mockReturnValue(
      mockProcess(`/path/docker-compose.yml.snapshot.${ts}\n`),
    );
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    await act(async () => { await result.current.load(); });
    expect(result.current.snapshots).toHaveLength(1);
    expect(result.current.snapshots[0].timestamp).toBe(ts);
    expect(result.current.snapshots[0].path).toBe(`/path/docker-compose.yml.snapshot.${ts}`);
  });

  it("load() ignores paths without .snapshot.<timestamp> suffix", async () => {
    mockSpawn.mockReturnValue(mockProcess("/path/docker-compose.yml.bak\n"));
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    await act(async () => { await result.current.load(); });
    expect(result.current.snapshots).toHaveLength(0);
  });

  it("load() sorts snapshots newest first", async () => {
    const old = 1600000000000;
    const newer = 1700000000000;
    mockSpawn.mockReturnValue(
      mockProcess(`/path/docker-compose.yml.snapshot.${old}\n/path/docker-compose.yml.snapshot.${newer}\n`),
    );
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    await act(async () => { await result.current.load(); });
    expect(result.current.snapshots[0].timestamp).toBe(newer);
    expect(result.current.snapshots[1].timestamp).toBe(old);
  });

  it("load() sets empty array on error", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    await act(async () => { await result.current.load(); });
    expect(result.current.snapshots).toEqual([]);
  });

  it("restore() returns the snapshot content via cockpit.spawn (cat)", async () => {
    const content = "services:\n  web:\n    image: nginx\n";
    mockSpawn.mockReturnValue(mockProcess(content));
    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    let restored = "";
    await act(async () => {
      restored = await result.current.restore("/path/docker-compose.yml.snapshot.123");
    });
    expect(restored).toBe(content);
  });

  it("remove() deletes snapshot then reloads list", async () => {
    const ts = 1700000000000;
    mockSpawn
      .mockImplementationOnce(lazy(""))                                              // rm (deleteSnapshot)
      .mockImplementationOnce(lazy(`/path/docker-compose.yml.snapshot.${ts}\n`)); // find (listSnapshots)

    const { result } = renderHook(() => useSnapshots("/path/docker-compose.yml"));
    void act(() => { void result.current.remove("/path/docker-compose.yml.snapshot.old"); });
    await waitFor(() => expect(result.current.snapshots).toHaveLength(1));
    expect(result.current.snapshots[0].timestamp).toBe(ts);
  });
});
