import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUpStream } from "./useUpStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

beforeEach(() => { mockSpawn.mockReset(); });

describe("useUpStream", () => {
  it("starts with empty lines and done=false, failed=false", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    expect(result.current.lines).toEqual([]);
    expect(result.current.done).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true on process completion", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true and failed=true on process error", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "up failed"));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("up failed");
  });

  it("parses newline-delimited output into LineEntry items", async () => {
    mockSpawn.mockReturnValue(mockProcess("Container myapp-web-1  Running\nContainer myapp-db-1  Started\n"));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0]).toHaveProperty("text");
    expect(result.current.lines[0]).toHaveProperty("kind");
  });

  it("strips ANSI escape codes from output", async () => {
    mockSpawn.mockReturnValue(mockProcess("\x1b[32mGreen text\x1b[0m\n"));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("Green text");
  });

  it("handles \\r carriage return — takes the last segment", async () => {
    mockSpawn.mockReturnValue(mockProcess("first\rsecond\n"));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("second");
  });

  it("filters out whitespace-only lines", async () => {
    mockSpawn.mockReturnValue(mockProcess("real line\n   \n\n"));
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.lines.every(l => l.text.trim() !== "")).toBe(true);
  });

  it("cancel() closes process", () => {
    const proc = mockProcess("");
    mockSpawn.mockReturnValue(proc);
    const { result } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    result.current.cancel();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("closes process on unmount", () => {
    const proc = mockProcess("");
    mockSpawn.mockReturnValue(proc);
    const { unmount } = renderHook(() => useUpStream("myapp", "/path/compose.yml"));
    unmount();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });
});
