import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAsyncAction } from "@rxtx4816/cockpit-plugin-base-react";

describe("useAsyncAction", () => {
  it("starts with loading=false and error=null", () => {
    const { result } = renderHook(() => useAsyncAction(async () => "value"));
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("returns the resolved value on success", async () => {
    const { result } = renderHook(() => useAsyncAction(async () => 42));
    const value = await act(() => result.current.execute());
    expect(value).toBe(42);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets error string on failure with Error instance", async () => {
    const action = vi.fn().mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useAsyncAction(action));
    await act(() => result.current.execute());
    expect(result.current.error).toBe("boom");
    expect(result.current.loading).toBe(false);
  });

  it("sets error string on failure with non-Error rejection", async () => {
    const action = vi.fn().mockRejectedValue("plain string error");
    const { result } = renderHook(() => useAsyncAction(action));
    await act(() => result.current.execute());
    expect(result.current.error).toBe("plain string error");
  });

  it("returns undefined when action throws", async () => {
    const action = vi.fn().mockRejectedValue(new Error("fail"));
    const { result } = renderHook(() => useAsyncAction(action));
    const value = await act(() => result.current.execute());
    expect(value).toBeUndefined();
  });

  it("clearError resets error to null", async () => {
    const action = vi.fn().mockRejectedValue(new Error("oops"));
    const { result } = renderHook(() => useAsyncAction(action));
    await act(() => result.current.execute());
    expect(result.current.error).toBe("oops");
    act(() => { result.current.clearError(); });
    expect(result.current.error).toBeNull();
  });

  it("sets loading=true while action is running", async () => {
    let resolve!: (v: string) => void;
    const action = vi.fn(() => new Promise<string>(r => { resolve = r; }));
    const { result } = renderHook(() => useAsyncAction(action));
    act(() => { void result.current.execute(); });
    expect(result.current.loading).toBe(true);
    await act(async () => { resolve("done"); });
    expect(result.current.loading).toBe(false);
  });
});
