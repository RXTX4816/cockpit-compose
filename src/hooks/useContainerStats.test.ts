import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useContainerStats } from "./useContainerStats";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

// Use mockImplementationOnce so the proc is created lazily (at spawn-call time),
// ensuring proc.stream() is registered before the microtask fires.
const lazy = (data: string, err?: string) => () => mockProcess(data, err);

beforeEach(() => { mockSpawn.mockReset(); });

const runningContainersJson = JSON.stringify([
  { ID: "abc123", Name: "web", Image: "nginx", State: "running", Status: "Up 2h", Ports: "0.0.0.0:8080->80/tcp", Service: "web" },
]);

const statsJson = JSON.stringify({
  id: "abc123", name: "web", cpu: "0.5%", mem: "50MiB / 1GiB", memPerc: "5%", net: "", block: "",
});

describe("useContainerStats", () => {
  it("starts with empty ports and null stats", () => {
    const { result } = renderHook(() => useContainerStats("myapp", "stopped"));
    expect(result.current.ports).toEqual([]);
    expect(result.current.stats).toBeNull();
  });

  it("does not call cockpit.spawn for stopped status", async () => {
    renderHook(() => useContainerStats("myapp", "stopped"));
    await act(async () => { await Promise.resolve(); });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("does not call cockpit.spawn for unknown status", async () => {
    renderHook(() => useContainerStats("myapp", "unknown"));
    await act(async () => { await Promise.resolve(); });
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("fetches ports when status=running", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(statsJson));
    const { result } = renderHook(() => useContainerStats("myapp", "running"));
    await waitFor(() => expect(result.current.ports[0]?.label).toBe("8080→80"));
    expect(result.current.ports[0]?.bindType).toBe("external");
  });

  it("fetches CPU stats when status=running", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(statsJson));
    const { result } = renderHook(() => useContainerStats("myapp", "running"));
    await waitFor(() => expect(result.current.stats?.cpu).toBeCloseTo(0.5));
  });

  it("fetches ports when status=partial", async () => {
    mockSpawn
      .mockImplementationOnce(lazy(runningContainersJson))
      .mockImplementationOnce(lazy(statsJson));
    const { result } = renderHook(() => useContainerStats("myapp", "partial"));
    await waitFor(() => expect(result.current.ports[0]?.label).toBe("8080→80"));
  });

  it("sets stats=null when no containers are running", async () => {
    const stoppedJson = JSON.stringify([
      { ID: "abc123", Name: "web", Image: "nginx", State: "exited", Status: "Exited", Ports: "", Service: "web" },
    ]);
    mockSpawn.mockImplementationOnce(lazy(stoppedJson));
    const { result } = renderHook(() => useContainerStats("myapp", "running"));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(result.current.stats).toBeNull();
  });

  it("deduplicates ports across containers", async () => {
    const twoRunning = JSON.stringify([
      { ID: "a", Name: "w1", Image: "nginx", State: "running", Ports: "0.0.0.0:8080->80/tcp", Service: "web1" },
      { ID: "b", Name: "w2", Image: "nginx", State: "running", Ports: "0.0.0.0:8080->80/tcp", Service: "web2" },
    ]);
    mockSpawn
      .mockImplementationOnce(lazy(twoRunning))
      .mockImplementationOnce(lazy(statsJson));
    const { result } = renderHook(() => useContainerStats("myapp", "running"));
    await waitFor(() => expect(result.current.ports).toHaveLength(1));
    expect(result.current.ports[0]?.label).toBe("8080→80");
  });

  it("silently ignores errors", async () => {
    mockSpawn.mockImplementationOnce(lazy("", "docker error"));
    const { result } = renderHook(() => useContainerStats("myapp", "running"));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    expect(result.current.stats).toBeNull();
  });

  it("polls at 10s interval when running", async () => {
    vi.useFakeTimers();
    mockSpawn.mockImplementation(lazy(runningContainersJson));
    const callsBefore = mockSpawn.mock.calls.length;

    renderHook(() => useContainerStats("myapp", "running"));

    await act(async () => { vi.advanceTimersByTime(10000); });

    expect(mockSpawn.mock.calls.length).toBeGreaterThan(callsBefore);
    vi.useRealTimers();
  });

  it("does not overlap polls when a call is slower than the 10s interval (#289)", async () => {
    // Regression test: this hook used to poll via a raw setInterval with no in-flight guard,
    // the same pileup-prone pattern already fixed elsewhere for this issue. It now goes
    // through useAutoRefresh, which must keep at most one call in flight. Each load() does up
    // to 2 spawns (listContainers, then getContainerStats) — calls 1-2 are the quick initial
    // mount load; call 3 (the second poll's listContainers) is made to hang.
    vi.useFakeTimers();
    let resolveHang: ((v: string) => void) | undefined;
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 3) {
        let streamCb: ((d: string) => void) | undefined;
        const p = new Promise<string>(resolve => { resolveHang = resolve; });
        return Object.assign(p.then(v => { streamCb?.(v); return v; }), {
          stream: (cb: (d: string) => void) => { streamCb = cb; },
          close: vi.fn(),
        });
      }
      return mockProcess(callCount % 2 === 1 ? runningContainersJson : statsJson);
    });

    renderHook(() => useContainerStats("myapp", "running"));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // let the initial load settle
    expect(callCount).toBe(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(callCount).toBe(3);

    // Advance well past several would-be intervals while that poll is still pending — with
    // the old setInterval behavior this would fire several additional overlapping calls.
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(callCount).toBe(3);

    await act(async () => { resolveHang?.(runningContainersJson); await Promise.resolve(); });
    vi.useRealTimers();
  });
});
