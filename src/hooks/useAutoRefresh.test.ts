import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutoRefresh } from "./useAutoRefresh";

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("useAutoRefresh", () => {
  it("calls fn at each interval", () => {
    const fn = vi.fn();
    renderHook(() => useAutoRefresh(fn, 1000));
    act(() => { vi.advanceTimersByTime(3000); });
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not call fn when paused=true", () => {
    const fn = vi.fn();
    renderHook(() => useAutoRefresh(fn, 1000, true));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(fn).not.toHaveBeenCalled();
  });

  it("stops interval on unmount", () => {
    const fn = vi.fn();
    const { unmount } = renderHook(() => useAutoRefresh(fn, 1000));
    unmount();
    act(() => { vi.advanceTimersByTime(3000); });
    expect(fn).not.toHaveBeenCalled();
  });

  it("uses latest fn ref without restarting the interval", () => {
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    let current = fn1;
    const { rerender } = renderHook(() => useAutoRefresh(current, 1000));
    current = fn2;
    rerender();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(fn1).not.toHaveBeenCalled();
    expect(fn2).toHaveBeenCalledTimes(1);
  });

  it("restarts interval when paused changes from true to false", () => {
    const fn = vi.fn();
    let paused = true;
    const { rerender } = renderHook(() => useAutoRefresh(fn, 1000, paused));
    act(() => { vi.advanceTimersByTime(2000); });
    expect(fn).not.toHaveBeenCalled();
    paused = false;
    rerender();
    act(() => { vi.advanceTimersByTime(2000); });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
