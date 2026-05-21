import { useEffect, useRef } from "react";

export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs: number,
  paused = false,
): void {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => void fnRef.current(), intervalMs);
    return () => clearInterval(t);
  }, [paused, intervalMs]);
}
