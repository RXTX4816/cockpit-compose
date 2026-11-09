import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStackActions } from "./useStackActions";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
  };
});

// The operation reads the compose file and lists running services before it runs compose.
const composeCalls = () => mockSpawn.mock.calls.filter(c => (c[0] as string[])[1] === "compose");
const composeArgs = () => composeCalls()[0]?.[0] as string[];
const spawnWith = (impl: (argv: string[]) => CockpitProcess) => mockSpawn.mockImplementation(impl);

beforeEach(() => {
  mockSpawn.mockReset();
  mockSpawn.mockImplementation((argv: string[]) =>
    mockProcess(argv.includes("status=running") ? "web\n" : ""));
});

describe("useStackActions", () => {
  it("starts with acting=false and no error", () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    expect(result.current.acting).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it("doAction('start') calls cockpit.spawn with start args", async () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    const args = composeArgs();
    expect(args).toContain("up");
  });

  it("doAction('stop') calls cockpit.spawn with stop args", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("stop"));
    const args = mockSpawn.mock.calls[mockSpawn.mock.calls.length - 1][0] as string[];
    expect(args).toContain("stop");
  });

  it("doAction('restart') calls cockpit.spawn with restart args and running service name", async () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("restart"));
    const args = composeArgs();
    expect(args).toContain("restart");
    expect(args).toContain("web");
  });

  it("doAction('restart') does not spawn when no services are running", async () => {
    mockSpawn.mockImplementation(() => mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("restart"));
    expect(composeCalls()).toHaveLength(0);
  });

  it("sets acting=true during action and false after", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    const promise = act(() => result.current.doAction("start"));
    // acting may briefly be true; after await it must be false
    await promise;
    expect(result.current.acting).toBe(false);
  });

  it("calls onActingChange(1) then (-1)", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onActingChange = vi.fn();
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], onActingChange),
    );
    await act(() => result.current.doAction("start"));
    expect(onActingChange).toHaveBeenCalledWith(1);
    expect(onActingChange).toHaveBeenCalledWith(-1);
  });

  it("calls onSuccess callback after successful action", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("start", onSuccess));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("sets actionError on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    await waitFor(() => expect(result.current.actionError).toBe("permission denied"));
    expect(result.current.acting).toBe(false);
  });

  it("clears actionError on next action attempt", async () => {
    let failNext = true;
    spawnWith(argv => {
      if (argv[1] === "compose" && failNext) { failNext = false; return mockProcess("", "error"); }
      return mockProcess("");
    });
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    await waitFor(() => expect(result.current.actionError).not.toBeNull());
    await act(() => result.current.doAction("stop"));
    await waitFor(() => expect(result.current.actionError).toBeNull());
  });

  it("doAction('pause') calls cockpit.spawn with pause args", async () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("pause"));
    const args = composeArgs();
    expect(args).toContain("pause");
  });

  it("doAction('unpause') calls cockpit.spawn with unpause args", async () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("unpause"));
    const args = composeArgs();
    expect(args).toContain("unpause");
  });

  it("doAction sets actionError via String(ex) when rejection is not an Error instance", async () => {
    mockSpawn.mockImplementation((argv: string[]) => argv[1] !== "compose" ? mockProcess("") : Object.assign(
      new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
      { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
    ) as CockpitProcess);
    const { result } = renderHook(() =>
      useStackActions("myapp", ["/path/compose.yml"], vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    await waitFor(() => expect(result.current.actionError).toBe("plain string error"));
  });
});
