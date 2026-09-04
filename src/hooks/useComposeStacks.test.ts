import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useComposeStacks } from "./useComposeStacks";
import { mockSpawn } from "../test/setup";

// Lazy: mockSpawn must return a *freshly created* process on each call (not the same
// eagerly-created one every time), so its data-delivery microtask fires after proc.stream()
// is registered. listStacks() now tries the engine HTTP API first (an extra async hop before
// this CLI spawn), so an eagerly-created process would already have resolved with no stream
// callback registered yet.
function mockProcess(data: string, error?: string) {
  let streamCb: ((data: string) => void) | null = null;
  const p = new Promise<void>((resolve, reject) => {
    queueMicrotask(() => {
      if (error) {
        reject(new Error(error));
      } else {
        if (streamCb) streamCb(data);
        resolve();
      }
    });
  });
  return Object.assign(p, {
    stream: (cb: (data: string) => void) => { streamCb = cb; },
    close: vi.fn(),
  });
}

const sampleStacks = JSON.stringify([
  { Name: "myapp", Status: "running(2)", ConfigFiles: "/home/user/myapp/docker-compose.yml" },
]);

beforeEach(() => {
  mockSpawn.mockReset();
});

describe("useComposeStacks", () => {
  it("starts in loading state", async () => {
    mockSpawn.mockImplementation(() => mockProcess("[]"));
    const { result } = renderHook(() => useComposeStacks());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
  });

  it("returns stacks after successful load", async () => {
    mockSpawn.mockImplementation(() => mockProcess(sampleStacks));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stacks).toHaveLength(1);
    expect(result.current.stacks[0].Name).toBe("myapp");
    expect(result.current.error).toBeNull();
  });

  it("does not surface error before FAIL_THRESHOLD (4) consecutive failures", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "Internal error"));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // First failure — should NOT show error yet
    expect(result.current.error).toBeNull();
  });

  it("surfaces error after FAIL_THRESHOLD consecutive failures", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "Internal error"));
    const { result } = renderHook(() => useComposeStacks());

    // Trigger 4 failures via refresh
    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refresh());
    }

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.stacks).toEqual([]);
  });

  it("clears error on success after failures", async () => {
    // Start with failures to build up fail count
    mockSpawn.mockImplementation(() => mockProcess("", "Internal error"));
    const { result } = renderHook(() => useComposeStacks());

    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refresh());
    }
    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Now return success
    mockSpawn.mockImplementation(() => mockProcess(sampleStacks));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.stacks).toHaveLength(1);
  });

  it("refresh function triggers re-fetch", async () => {
    mockSpawn.mockImplementation(() => mockProcess(sampleStacks));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = mockSpawn.mock.calls.length;
    act(() => result.current.refresh());
    await waitFor(() => expect(mockSpawn.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("handles null/empty JSON response gracefully", async () => {
    mockSpawn.mockImplementation(() => mockProcess("null"));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stacks).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  it("does not start a new fetch while a previous refresh is still in flight, but runs one more as soon as it settles (#289)", async () => {
    // refresh() itself returns instantly (it just bumps a tick) — the real fetch happens in a
    // separate effect, so a naive re-fetch-on-every-tick would let calls pile up on slow
    // hardware exactly like the un-paced polling this hook is meant to avoid. But a refresh()
    // that arrives mid-fetch isn't just dropped either — e.g. a stack action finishing calls
    // refresh() to show the result right away, and simply discarding that (leaving it to the
    // next *scheduled* poll, possibly several seconds out on constrained hardware) would make
    // a completed action look stuck. So: skip starting a second concurrent fetch, but run
    // exactly one more immediately once the in-flight one settles.
    let resolveFirst: (() => void) | undefined;
    let liveStreamCb: ((data: string) => void) | undefined;
    let callCount = 0;
    mockSpawn.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        const p = new Promise<void>(resolve => { resolveFirst = resolve; });
        return Object.assign(p, {
          stream: (cb: (data: string) => void) => { liveStreamCb = cb; },
          close: vi.fn(),
        });
      }
      return mockProcess(sampleStacks);
    });

    const { result } = renderHook(() => useComposeStacks());
    // listStacks() tries the engine HTTP API first (a chain of async hops) before reaching
    // this CLI spawn, so the first call only lands after those settle, not synchronously.
    await waitFor(() => expect(callCount).toBe(1));

    // A second refresh fires while the first fetch is still pending — it must be skipped,
    // not started as a second concurrent spawn.
    act(() => result.current.refresh());
    expect(callCount).toBe(1);

    // Resolving the first (now-superseded) fetch should immediately trigger the coalesced
    // follow-up — no further refresh() call needed.
    liveStreamCb?.(sampleStacks);
    resolveFirst?.();
    await waitFor(() => expect(callCount).toBe(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stacks).toHaveLength(1);
  });

  it("shows Docker-not-found message when error includes 'not found'", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "docker: command not found"));
    const { result } = renderHook(() => useComposeStacks());

    // Trigger FAIL_THRESHOLD (4) consecutive failures
    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refresh());
    }

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toMatch(/Docker not found/i);
  });
});
