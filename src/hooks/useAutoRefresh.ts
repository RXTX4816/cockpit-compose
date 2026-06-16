import { useEffect, useRef, useState } from "react";

export function useAutoRefresh(
  fn: () => void | Promise<void>,
  intervalMs: number,
  paused = false,
): void {
  const fnRef = useRef(fn);
  useEffect(() => { fnRef.current = fn; }, [fn]);

  // Pause polling when the browser tab is hidden — no need to hit Docker
  // while the user isn't looking, and it avoids false error alerts on resume.
  const [tabHidden, setTabHidden] = useState(() => document.hidden);
  useEffect(() => {
    const handler = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  useEffect(() => {
    if (paused || tabHidden) return;
    const t = setInterval(() => void fnRef.current(), intervalMs);
    return () => clearInterval(t);
  }, [paused, tabHidden, intervalMs]);
}
