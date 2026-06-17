import { useState, useCallback } from "react";

const EXPANDED_KEY = "cockpit-compose:expanded";

function loadExpandedFromStorage(): Set<string> {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set();
}

function saveExpandedToStorage(expanded: Set<string>) {
  try {
    localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]));
  } catch { /* ignore */ }
}

export function useExpandedStacks() {
  const [expanded, setExpanded] = useState<Set<string>>(loadExpandedFromStorage);

  const toggleExpanded = useCallback((name: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      saveExpandedToStorage(next);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
    saveExpandedToStorage(new Set());
  }, []);

  return { expanded, toggleExpanded, collapseAll };
}
