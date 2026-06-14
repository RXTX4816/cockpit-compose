import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useDownStack } from "./useDownStack";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, readAllProfiles: vi.fn().mockResolvedValue([]) };
});

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/home/user/myapp/docker-compose.yml",
};

beforeEach(() => { mockSpawn.mockReset(); });

describe("useDownStack", () => {
  it("starts with target=null, downing=false, error=null", () => {
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    expect(result.current.target).toBeNull();
    expect(result.current.downing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("open() sets the target stack", () => {
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    expect(result.current.target).toBe(stack);
  });

  it("close() clears target and error", () => {
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    act(() => { result.current.close(); });
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("execute() calls onSuccess and clears target on success", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onSuccess = vi.fn();
    const onActingChange = vi.fn();
    const { result } = renderHook(() => useDownStack(onSuccess, onActingChange));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.target).toBeNull();
    expect(result.current.downing).toBe(false);
  });

  it("execute() calls onActingChange(1) then onActingChange(-1)", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onActingChange = vi.fn();
    const { result } = renderHook(() => useDownStack(vi.fn(), onActingChange));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onActingChange).toHaveBeenCalledWith(1);
    expect(onActingChange).toHaveBeenCalledWith(-1);
  });

  it("execute() sets error on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "compose down failed"));
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    await waitFor(() => expect(result.current.error).toBe("compose down failed"));
    expect(result.current.downing).toBe(false);
    expect(result.current.target).toBe(stack);
  });

  it("execute() does nothing when target is null", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useDownStack(onSuccess, vi.fn()));
    await act(() => result.current.execute());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("execute() calls onDownComplete with the stack on success", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onDownComplete = vi.fn();
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn(), onDownComplete));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onDownComplete).toHaveBeenCalledOnce();
    expect(onDownComplete).toHaveBeenCalledWith(stack);
  });

  it("execute() does not call onDownComplete on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "compose down failed"));
    const onDownComplete = vi.fn();
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn(), onDownComplete));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onDownComplete).not.toHaveBeenCalled();
  });

  it("passes all ConfigFiles when multiple are listed", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const multiStack: ComposeStack = {
      ...stack,
      ConfigFiles: "/path/a.yml, /path/b.yml",
    };
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(multiStack); });
    await act(() => result.current.execute());
    const spawnArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(spawnArgs).toContain("/path/a.yml");
    expect(spawnArgs).toContain("/path/b.yml");
    expect(spawnArgs.filter(a => a === "-f")).toHaveLength(2);
  });

  it("execute() uses String(ex) when rejection is not an Error instance", async () => {
    mockSpawn.mockReturnValue(
      Object.assign(
        new Promise<string>((_, reject) => queueMicrotask(() => reject("plain string error"))),
        { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
      ) as CockpitProcess,
    );
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    await waitFor(() => expect(result.current.error).toBe("plain string error"));
  });
});
