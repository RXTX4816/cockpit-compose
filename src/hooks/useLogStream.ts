import { useState, useEffect, useRef, useCallback } from "react";
import { streamLogs } from "../api";

export const LOG_MAX_LINES = 500;

export function useLogStream(stackName: string) {
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [paused, setPaused] = useState(false);
  const [revision, setRevision] = useState(0);
  const bufRef = useRef("");
  const pausedRef = useRef(false);
  const sessionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    sessionRef.current += 1;
    const session = sessionRef.current;
    bufRef.current = "";
    pausedRef.current = false;
    setLines([]);
    setStreaming(true);
    setPaused(false);
    const proc = streamLogs(stackName);
    proc.stream(data => {
      if (cancelled || pausedRef.current) return;
      bufRef.current += data;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      if (parts.length > 0) {
        setLines(prev => {
          if (sessionRef.current !== session) return prev;
          const next = [...prev, ...parts.filter(Boolean)];
          return next.length > LOG_MAX_LINES ? next.slice(next.length - LOG_MAX_LINES) : next;
        });
      }
    });
    proc.then(() => { if (!cancelled) setStreaming(false); })
       .catch(() => { if (!cancelled) setStreaming(false); });
    return () => { cancelled = true; proc.close(); };
  }, [stackName, revision]);

  const pause = useCallback(() => {
    pausedRef.current = true;
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
  }, []);

  const restart = useCallback(() => setRevision(r => r + 1), []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, streaming, paused, pause, resume, restart, clear };
}
