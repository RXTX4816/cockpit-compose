import { useEffect, useRef } from "react";

export function usePolling(fn: () => void | Promise<void>, intervalMs: number): void {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  useEffect(() => {
    const t = setInterval(() => void fnRef.current(), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
