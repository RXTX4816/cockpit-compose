import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useUpStream } from "./useUpStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

const mockUser = vi.fn().mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });

beforeEach(() => {
  mockSpawn.mockReset();
  mockUser.mockReset().mockResolvedValue({ id: 1000, name: "user", home: "/home/user" });
  // Include user() so composeFileSuperuser can resolve the current user.
  // Spawn is called twice for stat (dir + file) then once for the actual process.
  vi.stubGlobal("cockpit", { spawn: mockSpawn, user: mockUser });
});

// The first two spawns from any test are stat calls from composeFileSuperuser.
// Use a factory so the actual process is created lazily (when spawn is called),
// preventing queueMicrotask-based rejections from firing before a handler attaches.
function withStatMocks(makeActual: () => CockpitProcess) {
  let count = 0;
  mockSpawn.mockImplementation(() => {
    count++;
    if (count <= 2) return mockProcess("1000\n");
    return makeActual();
  });
}

describe("useUpStream", () => {
  it("starts with empty lines and done=false, failed=false", () => {
    withStatMocks(() => mockProcess(""));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    expect(result.current.lines).toEqual([]);
    expect(result.current.done).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true on process completion", async () => {
    withStatMocks(() => mockProcess(""));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true and failed=true on process error", async () => {
    withStatMocks(() => mockProcess("", "up failed"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("up failed");
  });

  it("parses newline-delimited output into LineEntry items", async () => {
    withStatMocks(() => mockProcess("Container myapp-web-1  Running\nContainer myapp-db-1  Started\n"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0]).toHaveProperty("text");
    expect(result.current.lines[0]).toHaveProperty("kind");
  });

  it("strips ANSI escape codes from output", async () => {
    withStatMocks(() => mockProcess("\x1b[32mGreen text\x1b[0m\n"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("Green text");
  });

  it("handles \\r carriage return — takes the last segment", async () => {
    withStatMocks(() => mockProcess("first\rsecond\n"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("second");
  });

  it("filters out whitespace-only lines", async () => {
    withStatMocks(() => mockProcess("real line\n   \n\n"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.lines.every(l => l.text.trim() !== "")).toBe(true);
  });

  it("cancel() closes process", async () => {
    const proc = Object.assign(new Promise<string>(() => {}), {
      stream: vi.fn().mockReturnThis(),
      close: vi.fn(),
      input: vi.fn(),
    }) as CockpitProcess;
    withStatMocks(() => proc);
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    result.current.cancel();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("closes process on unmount", async () => {
    const proc = Object.assign(new Promise<string>(() => {}), {
      stream: vi.fn().mockReturnThis(),
      close: vi.fn(),
      input: vi.fn(),
    }) as CockpitProcess;
    withStatMocks(() => proc);
    const { unmount } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(3));
    unmount();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("produces no line entries when stream only contains whitespace-only lines", async () => {
    withStatMocks(() => mockProcess("   \n   \n"));
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.lines).toHaveLength(0);
  });

  it("uses String(ex) when rejection is not an Error instance", async () => {
    withStatMocks(() =>
      Object.assign(
        new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
        { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
      ) as CockpitProcess,
    );
    const { result } = renderHook(() => useUpStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("plain string error");
  });
});
