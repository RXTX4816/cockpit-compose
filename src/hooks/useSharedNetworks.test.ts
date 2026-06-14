import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listProjectNetworks: vi.fn(),
    listNetworkConnectedProjects: vi.fn(),
  };
});

import { listProjectNetworks, listNetworkConnectedProjects } from "../api";
import { useSharedNetworks } from "./useSharedNetworks";

const mockListProjectNetworks = vi.mocked(listProjectNetworks);
const mockListNetworkConnectedProjects = vi.mocked(listNetworkConnectedProjects);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useSharedNetworks", () => {
  it("returns empty result immediately when enabled is false", () => {
    const { result } = renderHook(() => useSharedNetworks("myapp", false));
    expect(result.current.sharedNetworks).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns empty result when stackName is empty", () => {
    const { result } = renderHook(() => useSharedNetworks("", true));
    expect(result.current.sharedNetworks).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets loading true while fetching and false after", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("myapp_default\n"));
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("myapp\n"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("returns shared networks filtered to exclude the current stack", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("myapp_default\n"));
    // "otherapp" shares the network; "myapp" is the current stack and should be excluded
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("myapp\notherapp\n"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sharedNetworks).toEqual([
      { name: "myapp_default", sharedWith: ["otherapp"] },
    ]);
  });

  it("returns sharedWith as empty array when only the current stack uses the network", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("myapp_default\n"));
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("myapp\n"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sharedNetworks).toEqual([
      { name: "myapp_default", sharedWith: [] },
    ]);
  });

  it("deduplicates project names in sharedWith", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("net1\n"));
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("otherapp\notherapp\n"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sharedNetworks[0].sharedWith).toEqual(["otherapp"]);
  });

  it("handles multiple networks", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("net1\nnet2\n"));
    mockListNetworkConnectedProjects
      .mockReturnValueOnce(mockProcess("myapp\napp1\n"))
      .mockReturnValueOnce(mockProcess("myapp\napp2\n"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.sharedNetworks).toHaveLength(2);
    expect(result.current.sharedNetworks[0].sharedWith).toEqual(["app1"]);
    expect(result.current.sharedNetworks[1].sharedWith).toEqual(["app2"]);
  });

  it("sets error when listProjectNetworks rejects", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("", "permission denied"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/permission denied/i);
    expect(result.current.sharedNetworks).toEqual([]);
  });

  it("sets error when listNetworkConnectedProjects rejects", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("myapp_default\n"));
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("", "network error"));

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toMatch(/network error/i);
  });

  it("resets to empty when enabled switches from true to false", async () => {
    mockListProjectNetworks.mockReturnValue(mockProcess("myapp_default\n"));
    mockListNetworkConnectedProjects.mockReturnValue(mockProcess("otherapp\n"));

    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSharedNetworks("myapp", enabled),
      { initialProps: { enabled: true } }
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.sharedNetworks).toHaveLength(1);

    rerender({ enabled: false });
    expect(result.current.sharedNetworks).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it("sets error via String(ex) when rejection is not an Error instance", async () => {
    mockListProjectNetworks.mockReturnValue(
      Object.assign(
        new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
        { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
      ) as CockpitProcess,
    );

    const { result } = renderHook(() => useSharedNetworks("myapp", true));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe("plain string error");
  });
});
