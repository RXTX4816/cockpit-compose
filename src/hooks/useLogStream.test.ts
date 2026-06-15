import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useLogStream, LOG_MAX_LINES } from "./useLogStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

beforeEach(() => { mockSpawn.mockReset(); });

describe("useLogStream", () => {
  it("starts with streaming=true and empty lines", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    expect(result.current.streaming).toBe(true);
    expect(result.current.lines).toEqual([]);
    await act(async () => {});
  });

  it("splits newline-delimited data into lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
    expect(result.current.lines).toEqual(["line1", "line2"]);
  });

  it("strips ANSI escape codes from log data", async () => {
    const ansiData = "\x1b[1;32m[web] |\x1b[0m \x1b[37mhello world\x1b[0m\n";
    mockSpawn.mockReturnValue(mockProcess(ansiData));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toHaveLength(1));
    expect(result.current.lines[0]).toBe("[web] | hello world");
  });

  it("filters out blank lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\n\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
  });

  it("sets streaming=false when process resolves", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("sets streaming=false when process rejects", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "stream error"));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.streaming).toBe(false));
  });

  it("pause() sets paused=true", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    act(() => { result.current.pause(); });
    expect(result.current.paused).toBe(true);
    await act(async () => {});
  });

  it("resume() sets paused=false", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    act(() => { result.current.pause(); });
    act(() => { result.current.resume(); });
    expect(result.current.paused).toBe(false);
    await act(async () => {});
  });

  it("restart() clears lines and starts a fresh stream", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\n"));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toContain("line1"));

    mockSpawn.mockReturnValue(mockProcess("line2\n"));
    act(() => { result.current.restart(); });

    await waitFor(() => expect(result.current.lines).toEqual(["line2"]));
  });

  it("clear() empties lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("line1\nline2\n"));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toHaveLength(2));
    act(() => { result.current.clear(); });
    expect(result.current.lines).toEqual([]);
  });

  it("caps lines at LOG_MAX_LINES", async () => {
    const data = Array.from({ length: LOG_MAX_LINES + 50 }, (_, i) => `line${i}`).join("\n") + "\n";
    mockSpawn.mockReturnValue(mockProcess(data));
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
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
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines).toEqual(["partial", "complete"]));
  });

  it("re-initializes when stackName changes", async () => {
    mockSpawn.mockReturnValue(mockProcess("lineA\n"));
    const { result, rerender } = renderHook(({ name }) => useLogStream(name, ["/path/compose.yml"]), {
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
    const { unmount } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    unmount();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("ignores stream data when paused", async () => {
    let streamCb: ((data: string) => void) | null = null;
    const proc = Object.assign(
      new Promise<string>(() => {}),
      {
        stream: (cb: (data: string) => void) => { streamCb = cb; return proc as CockpitProcess; },
        close: vi.fn(),
        input: vi.fn(),
      },
    ) as CockpitProcess;
    mockSpawn.mockReturnValue(proc);
    const { result } = renderHook(() => useLogStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(streamCb).not.toBeNull());
    act(() => { result.current.pause(); });
    act(() => { streamCb?.("ignored line\n"); });
    expect(result.current.lines).toHaveLength(0);
  });
});
