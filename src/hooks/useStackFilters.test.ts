import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStackFilters } from "./useStackFilters";
import type { ComposeStack } from "../api";

function makeStack(name: string, status: string): ComposeStack {
  return { Name: name, Status: status, ConfigFiles: `/${name}/compose.yml` };
}

const stacks: ComposeStack[] = [
  makeStack("app-a", "running(2)"),
  makeStack("app-b", "running(1)"),
  makeStack("app-c", "exited(0)"),
  makeStack("app-d", "running(0)/stopped(1)"),
];

describe("useStackFilters", () => {
  it("returns all stacks when no filter or search is active", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    expect(result.current.filteredStacks).toHaveLength(4);
  });

  it("statusCounts tallies stacks by parsed status", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    expect(result.current.statusCounts["running"]).toBeGreaterThanOrEqual(1);
  });

  it("toggleFilter adds a status filter", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    act(() => { result.current.toggleFilter("running"); });
    expect(result.current.activeFilters.has("running")).toBe(true);
    expect(result.current.filteredStacks.every(s => s.Status.startsWith("running"))).toBe(true);
  });

  it("toggleFilter removes an already-active filter", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    act(() => { result.current.toggleFilter("running"); });
    act(() => { result.current.toggleFilter("running"); });
    expect(result.current.activeFilters.has("running")).toBe(false);
    expect(result.current.filteredStacks).toHaveLength(4);
  });

  it("filters stacks by searchTerm (case-insensitive)", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    act(() => { result.current.setSearchTerm("APP-A"); });
    expect(result.current.filteredStacks).toHaveLength(1);
    expect(result.current.filteredStacks[0].Name).toBe("app-a");
  });

  it("clearFilters resets search and active filters", () => {
    const { result } = renderHook(() => useStackFilters(stacks));
    act(() => { result.current.setSearchTerm("app-a"); result.current.toggleFilter("running"); });
    act(() => { result.current.clearFilters(); });
    expect(result.current.searchTerm).toBe("");
    expect(result.current.activeFilters.size).toBe(0);
    expect(result.current.filteredStacks).toHaveLength(4);
  });

  it("stale filters are auto-removed when stacks change", () => {
    const { result, rerender } = renderHook(({ s }) => useStackFilters(s), {
      initialProps: { s: stacks },
    });
    act(() => { result.current.toggleFilter("stopped"); });
    expect(result.current.activeFilters.has("stopped")).toBe(true);
    rerender({ s: [makeStack("app-a", "running(1)"), makeStack("app-b", "running(1)")] });
    expect(result.current.activeFilters.has("stopped")).toBe(false);
  });
});
