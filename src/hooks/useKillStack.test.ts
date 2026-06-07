import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useKillStack } from "./useKillStack";
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

describe("useKillStack", () => {
  it("starts with target=null, killing=false, error=null", () => {
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    expect(result.current.target).toBeNull();
    expect(result.current.killing).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("open() sets the target stack", () => {
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    expect(result.current.target).toBe(stack);
  });

  it("close() clears target and error", () => {
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    act(() => { result.current.close(); });
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("execute() calls onSuccess and clears target on success", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onSuccess = vi.fn();
    const onActingChange = vi.fn();
    const { result } = renderHook(() => useKillStack(onSuccess, onActingChange));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onSuccess).toHaveBeenCalledOnce();
    expect(result.current.target).toBeNull();
    expect(result.current.killing).toBe(false);
  });

  it("execute() calls onActingChange(1) then onActingChange(-1)", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onActingChange = vi.fn();
    const { result } = renderHook(() => useKillStack(vi.fn(), onActingChange));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(onActingChange).toHaveBeenCalledWith(1);
    expect(onActingChange).toHaveBeenCalledWith(-1);
  });

  it("execute() sets error on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "signal: killed"));
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    await waitFor(() => expect(result.current.error).toBe("signal: killed"));
    expect(result.current.killing).toBe(false);
    expect(result.current.target).toBe(stack);
  });

  it("execute() does nothing when target is null", async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useKillStack(onSuccess, vi.fn()));
    await act(() => result.current.execute());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("passes all ConfigFiles when multiple are listed", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const multiStack: ComposeStack = {
      ...stack,
      ConfigFiles: "/path/a.yml, /path/b.yml",
    };
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(multiStack); });
    await act(() => result.current.execute());
    const spawnArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(spawnArgs).toContain("/path/a.yml");
    expect(spawnArgs).toContain("/path/b.yml");
    expect(spawnArgs.filter(a => a === "-f")).toHaveLength(2);
  });

  it("spawn args contain 'kill'", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    const spawnArgs = mockSpawn.mock.calls[0][0] as string[];
    expect(spawnArgs).toContain("kill");
  });
});
