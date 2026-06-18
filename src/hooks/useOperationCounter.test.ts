import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useOperationCounter } from "./useOperationCounter";

describe("useOperationCounter", () => {
  it("starts at zero", () => {
    const { result } = renderHook(() => useOperationCounter());
    expect(result.current.activeOps).toBe(0);
  });

  it("increment increases count", () => {
    const { result } = renderHook(() => useOperationCounter());
    act(() => { result.current.increment(); });
    expect(result.current.activeOps).toBe(1);
  });

  it("multiple increments accumulate", () => {
    const { result } = renderHook(() => useOperationCounter());
    act(() => { result.current.increment(); result.current.increment(); });
    expect(result.current.activeOps).toBe(2);
  });

  it("decrement decreases count", () => {
    const { result } = renderHook(() => useOperationCounter());
    act(() => { result.current.increment(); result.current.increment(); });
    act(() => { result.current.decrement(); });
    expect(result.current.activeOps).toBe(1);
  });

  it("decrement does not go below zero", () => {
    const { result } = renderHook(() => useOperationCounter());
    act(() => { result.current.decrement(); });
    expect(result.current.activeOps).toBe(0);
  });
});
