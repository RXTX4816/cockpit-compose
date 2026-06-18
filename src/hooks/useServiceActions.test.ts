import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useServiceActions } from "./useServiceActions";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    readAllProfiles: vi.fn().mockResolvedValue([]),
  };
});

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(2)",
  ConfigFiles: "/opt/myapp/compose.yml",
};

beforeEach(() => { mockSpawn.mockReset(); });

describe("useServiceActions", () => {
  it("starts with actingService=null", () => {
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    expect(result.current.actingService).toBeNull();
  });

  it("doServiceAction('start') spawns compose up -d with service name", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("start", "web"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("up");
    expect(args).toContain("-d");
    expect(args).toContain("web");
  });

  it("doServiceAction('stop') spawns compose stop with service name", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("stop", "db"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("stop");
    expect(args).toContain("db");
  });

  it("doServiceAction('restart') spawns compose restart with service name", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("restart", "worker"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("restart");
    expect(args).toContain("worker");
  });

  it("actingService is null after action completes", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("stop", "web"));
    expect(result.current.actingService).toBeNull();
  });

  it("actingService is null after a failed action", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("stop", "web"));
    expect(result.current.actingService).toBeNull();
  });

  it("calls onActingChange(1) then (-1)", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onActingChange = vi.fn();
    const { result } = renderHook(() => useServiceActions(stack, onActingChange));
    await act(() => result.current.doServiceAction("start", "web"));
    expect(onActingChange).toHaveBeenCalledWith(1);
    expect(onActingChange).toHaveBeenCalledWith(-1);
  });

  it("calls onSuccess callback after successful action", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("start", "web", onSuccess));
    expect(onSuccess).toHaveBeenCalledOnce();
  });

  it("does not call onSuccess on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "error"));
    const onSuccess = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("stop", "web", onSuccess));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("passes project name and config file to spawn", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const { result } = renderHook(() => useServiceActions(stack, vi.fn()));
    await act(() => result.current.doServiceAction("stop", "web"));
    const args = mockSpawn.mock.calls[0][0] as string[];
    expect(args).toContain("myapp");
    expect(args).toContain("/opt/myapp/compose.yml");
  });
});
