import { usePersistedSet } from "@rxtx4816/cockpit-plugin-base-react";

const EXPANDED_KEY = "cockpit-compose:expanded";

export function useExpandedStacks() {
  const { items: expanded, toggle: toggleExpanded, clear: collapseAll } = usePersistedSet(EXPANDED_KEY);
  return { expanded, toggleExpanded, collapseAll };
}
