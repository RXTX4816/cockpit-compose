import { useState, useCallback } from "react";

/**
 * Tracks the count of active in-flight operations.
 * Used to suppress auto-refresh while operations are running.
 */
export function useOperationCounter() {
  const [activeOps, setActiveOps] = useState(0);

  const increment = useCallback(() => {
    setActiveOps(n => n + 1);
  }, []);

  const decrement = useCallback(() => {
    setActiveOps(n => Math.max(0, n - 1));
  }, []);

  return { activeOps, increment, decrement };
}
