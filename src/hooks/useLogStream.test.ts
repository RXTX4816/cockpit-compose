import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLogStream, LOG_MAX_LINES } from "./useLogStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

beforeEach(() => { mockSpawn.mockReset(); });

describe("useLogStream", () => {
  it("starts with streaming=true and empty lines", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp"));
    expect(result.current.streaming).toBe(true);
    expect(result.current.lines).toEqual([]);
  });

  it("splits newline-delimited data into lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
    expect(result.current.lines).toEqual(["line1", "line2"]);
  });

  it("filters out blank lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\n\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
  });

  it("sets streaming=false when process resolves", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("sets streaming=false when process rejects", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "stream error"));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("stop() closes process and sets streaming=false", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp"));
    act(() => { result.current.stop(); });
    expect(result.current.streaming).toBe(false);
  });

  it("clear() empties lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
    act(() => { result.current.clear(); });
    expect(result.current.lines).toEqual([]);
  });

  it("caps lines at LOG_MAX_LINES", async () => {
    const data = Array.from({ length: LOG_MAX_LINES + 50 }, (_, i) => `line${i}`).join("\n") + "\n";
    mockSpawn.mockReturnValue(mockProcess(data));
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.lines.length).toBe(LOG_MAX_LINES));
  });

  it("buffers partial lines across chunks", async () => {
    let streamCb: ((d: string) => void) | null = null;
    const p = new Promise<string>(resolve => {
      queueMicrotask(() => {
        streamCb?.("par");
        streamCb?.("tial\ncomplete\n");
        resolve("");
      });
    });
    const proc = Object.assign(p, {
      stream: (cb: (d: string) => void) => { streamCb = cb; return proc; },
      close: vi.fn(),
      input: vi.fn(),
    }) as CockpitProcess;
    mockSpawn.mockReturnValue(proc);
    const { result } = renderHook(() => useLogStream("myapp"));
    await waitFor(() => expect(result.current.lines).toEqual(["partial", "complete"]));
  });

  it("re-initializes when stackName changes", async () => {
    mockSpawn.mockReturnValue(mockProcess("lineA\n"));
    const { result, rerender } = renderHook(({ name }) => useLogStream(name), {
      initialProps: { name: "stack1" },
    });
    await waitFor(() => expect(result.current.lines).toHaveLength(1));

    mockSpawn.mockReturnValue(mockProcess("lineB\n"));
    rerender({ name: "stack2" });
    await waitFor(() => expect(result.current.lines).toEqual(["lineB"]));
  });

  it("closes process on unmount", () => {
    const proc = mockProcess("");
    mockSpawn.mockReturnValue(proc);
    const { unmount } = renderHook(() => useLogStream("myapp"));
    unmount();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });
});
