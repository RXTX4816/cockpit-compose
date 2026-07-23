import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { usePullStream } from "./usePullStream";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    readAllProfiles: vi.fn().mockResolvedValue([]),
    stackSuperuser: vi.fn().mockResolvedValue(undefined),
  };
});

import { stackSuperuser } from "../api";
const mockStackSuperuser = vi.mocked(stackSuperuser);

beforeEach(() => {
  mockSpawn.mockReset();
  mockStackSuperuser.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal("cockpit", { spawn: mockSpawn });
});

describe("usePullStream", () => {
  it("starts with empty lines and done=false, failed=false", () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    expect(result.current.lines).toEqual([]);
    expect(result.current.done).toBe(false);
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true on process completion", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(false);
  });

  it("sets done=true and failed=true on process error", async () => {
    mockSpawn.mockImplementation(() => mockProcess("", "pull failed"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("pull failed");
  });

  it("parses newline-delimited output into LineEntry items", async () => {
    mockSpawn.mockImplementation(() => mockProcess("Pulling nginx\nPulled latest\n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0]).toHaveProperty("text");
    expect(result.current.lines[0]).toHaveProperty("kind");
  });

  it("strips ANSI escape codes from output", async () => {
    mockSpawn.mockImplementation(() => mockProcess("\x1b[32mGreen text\x1b[0m\n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("Green text");
  });

  it("handles \\r carriage return — takes the last segment", async () => {
    mockSpawn.mockImplementation(() => mockProcess("first\rsecond\n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.lines.length).toBeGreaterThan(0));
    expect(result.current.lines[0].text).toBe("second");
  });

  it("filters out whitespace-only lines", async () => {
    mockSpawn.mockImplementation(() => mockProcess("real line\n   \n\n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.lines.every(l => l.text.trim() !== "")).toBe(true);
  });

  it("cancel() closes process", async () => {
    const proc = Object.assign(new Promise<string>(() => {}), {
      stream: vi.fn().mockReturnThis(),
      close: vi.fn(),
      input: vi.fn(),
    }) as CockpitProcess;
    mockSpawn.mockReturnValue(proc);
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    result.current.cancel();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("closes process on unmount", async () => {
    const proc = Object.assign(new Promise<string>(() => {}), {
      stream: vi.fn().mockReturnThis(),
      close: vi.fn(),
      input: vi.fn(),
    }) as CockpitProcess;
    mockSpawn.mockReturnValue(proc);
    const { unmount } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(mockSpawn).toHaveBeenCalledTimes(1));
    unmount();
    expect((proc as unknown as { close: ReturnType<typeof vi.fn> }).close).toHaveBeenCalled();
  });

  it("produces no line entries when stream only contains whitespace-only lines", async () => {
    mockSpawn.mockImplementation(() => mockProcess("   \n   \n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.lines).toHaveLength(0);
  });

  it("requests superuser escalation via stackSuperuser and passes it to the spawn", async () => {
    mockStackSuperuser.mockResolvedValue("try");
    mockSpawn.mockImplementation(() => mockProcess("Pull output\n"));
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(mockSpawn.mock.calls[0][1]).toMatchObject({ superuser: "try" });
  });

  it("uses String(ex) when rejection is not an Error instance", async () => {
    const proc = Object.assign(
      new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
      { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
    ) as CockpitProcess;
    mockSpawn.mockReturnValue(proc);
    const { result } = renderHook(() => usePullStream("myapp", ["/path/compose.yml"]));
    await waitFor(() => expect(result.current.done).toBe(true));
    expect(result.current.failed).toBe(true);
    expect(result.current.errorMsg).toBe("plain string error");
  });
});
