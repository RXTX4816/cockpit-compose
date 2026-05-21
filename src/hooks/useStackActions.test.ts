import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useStackActions } from "./useStackActions";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";

beforeEach(() => { mockSpawn.mockReset(); });

describe("useStackActions", () => {
  it("starts with acting=false and no error", () => {
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    expect(result.current.acting).toBe(false);
    expect(result.current.actionError).toBeNull();
  });

  it("doAction('start') calls cockpit.spawn with start args", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("up");
  });

  it("doAction('stop') calls cockpit.spawn with stop args", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("stop"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("stop");
  });

  it("doAction('restart') calls cockpit.spawn with restart args", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("restart"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("restart");
  });

  it("sets acting=true during action and false after", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
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
      useStackActions("myapp", "/path/compose.yml", onActingChange),
    );
    await act(() => result.current.doAction("start"));
    expect(onActingChange).toHaveBeenCalledWith(1);
    expect(onActingChange).toHaveBeenCalledWith(-1);
  });

  it("calls onSuccess callback after successful action", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("start", onSuccess));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("sets actionError on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    await waitFor(() => expect(result.current.actionError).toBe("permission denied"));
    expect(result.current.acting).toBe(false);
  });

  it("clears actionError on next action attempt", async () => {
    mockSpawn
      .mockReturnValueOnce(mockProcess("", "error"))
      .mockReturnValueOnce(mockProcess(""));
    const { result } = renderHook(() =>
      useStackActions("myapp", "/path/compose.yml", vi.fn()),
    );
    await act(() => result.current.doAction("start"));
    await waitFor(() => expect(result.current.actionError).not.toBeNull());
    await act(() => result.current.doAction("stop"));
    await waitFor(() => expect(result.current.actionError).toBeNull());
  });
});
