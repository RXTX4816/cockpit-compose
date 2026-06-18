import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useExpandedStacks } from "./useExpandedStacks";

const EXPANDED_KEY = "cockpit-compose:expanded";

describe("useExpandedStacks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts empty when localStorage is empty", () => {
    const { result } = renderHook(() => useExpandedStacks());
    expect(result.current.expanded.size).toBe(0);
  });

  it("loads existing entries from localStorage on init", () => {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify(["myapp", "otherapp"]));
    const { result } = renderHook(() => useExpandedStacks());
    expect(result.current.expanded.has("myapp")).toBe(true);
    expect(result.current.expanded.has("otherapp")).toBe(true);
  });

  it("toggleExpanded adds a name that is not present", () => {
    const { result } = renderHook(() => useExpandedStacks());
    act(() => { result.current.toggleExpanded("myapp"); });
    expect(result.current.expanded.has("myapp")).toBe(true);
  });

  it("toggleExpanded removes a name that is already present", () => {
    const { result } = renderHook(() => useExpandedStacks());
    act(() => { result.current.toggleExpanded("myapp"); });
    act(() => { result.current.toggleExpanded("myapp"); });
    expect(result.current.expanded.has("myapp")).toBe(false);
  });

  it("persists expanded state to localStorage", () => {
    const { result } = renderHook(() => useExpandedStacks());
    act(() => { result.current.toggleExpanded("myapp"); });
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY)!);
    expect(stored).toContain("myapp");
  });

  it("collapseAll clears all expanded entries", () => {
    const { result } = renderHook(() => useExpandedStacks());
    act(() => { result.current.toggleExpanded("myapp"); result.current.toggleExpanded("otherapp"); });
    act(() => { result.current.collapseAll(); });
    expect(result.current.expanded.size).toBe(0);
  });

  it("collapseAll persists empty state to localStorage", () => {
    const { result } = renderHook(() => useExpandedStacks());
    act(() => { result.current.toggleExpanded("myapp"); });
    act(() => { result.current.collapseAll(); });
    const stored = JSON.parse(localStorage.getItem(EXPANDED_KEY)!);
    expect(stored).toEqual([]);
  });
});
