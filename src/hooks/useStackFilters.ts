import { useState, useCallback, useMemo, useEffect } from "react";
import { type ComposeStack, parseStackStatus } from "../api";

const STATUS_FILTER_OPTIONS = ["running", "partial", "stopped", "paused"] as const;
export type StatusFilter = (typeof STATUS_FILTER_OPTIONS)[number];

export function useStackFilters(stacks: ComposeStack[]) {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<StatusFilter>>(new Set());

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of stacks) {
      const st = parseStackStatus(s.Status);
      counts[st] = (counts[st] ?? 0) + 1;
    }
    return counts;
  }, [stacks]);

  // Remove active filters that have no matching stacks
  useEffect(() => {
    setActiveFilters(prev => {
      const cleaned = new Set([...prev].filter(f => (statusCounts[f] ?? 0) > 0));
      return cleaned.size === prev.size ? prev : cleaned;
    });
  }, [statusCounts]);

  const filteredStacks = useMemo(() => {
    let result = stacks;
    if (activeFilters.size > 0) {
      result = result.filter(s => activeFilters.has(parseStackStatus(s.Status) as StatusFilter));
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(s => s.Name.toLowerCase().includes(lower));
    }
    return result;
  }, [stacks, activeFilters, searchTerm]);

  const toggleFilter = useCallback((filter: StatusFilter) => {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(filter)) next.delete(filter);
      else next.add(filter);
      return next;
    });
  }, []);

  const clearFilters = useCallback(() => {
    setSearchTerm("");
    setActiveFilters(new Set());
  }, []);

  return {
    searchTerm,
    setSearchTerm,
    activeFilters,
    toggleFilter,
    filteredStacks,
    statusCounts,
    STATUS_FILTER_OPTIONS,
    clearFilters,
  };
}
