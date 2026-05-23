import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useComposeStacks } from "./useComposeStacks";
import { mockSpawn } from "../test/setup";

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
    mockSpawn.mockReturnValue(mockProcess("[]"));
    const { result } = renderHook(() => useComposeStacks());
    expect(result.current.loading).toBe(true);
    await act(async () => {});
  });

  it("returns stacks after successful load", async () => {
    mockSpawn.mockReturnValue(mockProcess(sampleStacks));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stacks).toHaveLength(1);
    expect(result.current.stacks[0].Name).toBe("myapp");
    expect(result.current.error).toBeNull();
  });

  it("does not surface error before FAIL_THRESHOLD (4) consecutive failures", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "Internal error"));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    // First failure — should NOT show error yet
    expect(result.current.error).toBeNull();
  });

  it("surfaces error after FAIL_THRESHOLD consecutive failures", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "Internal error"));
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
    mockSpawn.mockReturnValue(mockProcess("", "Internal error"));
    const { result } = renderHook(() => useComposeStacks());

    for (let i = 0; i < 4; i++) {
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.refresh());
    }
    await waitFor(() => expect(result.current.error).not.toBeNull());

    // Now return success
    mockSpawn.mockReturnValue(mockProcess(sampleStacks));
    act(() => result.current.refresh());
    await waitFor(() => expect(result.current.error).toBeNull());
    expect(result.current.stacks).toHaveLength(1);
  });

  it("refresh function triggers re-fetch", async () => {
    mockSpawn.mockReturnValue(mockProcess(sampleStacks));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const callsBefore = mockSpawn.mock.calls.length;
    act(() => result.current.refresh());
    await waitFor(() => expect(mockSpawn.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it("handles null/empty JSON response gracefully", async () => {
    mockSpawn.mockReturnValue(mockProcess("null"));
    const { result } = renderHook(() => useComposeStacks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stacks).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
