import { useState, useEffect, useRef, useCallback } from "react";
import { streamLogs } from "../api";

export const LOG_MAX_LINES = 500;

export function useLogStream(stackName: string) {
  const [lines, setLines] = useState<string[]>([]);
  const [streaming, setStreaming] = useState(true);
  const procRef = useRef<CockpitProcess | null>(null);
  const bufRef = useRef("");

  useEffect(() => {
    bufRef.current = "";
    setLines([]);
    setStreaming(true);
    const proc = streamLogs(stackName);
    procRef.current = proc;
    proc.stream(data => {
      bufRef.current += data;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      if (parts.length > 0) {
        setLines(prev => {
          const next = [...prev, ...parts.filter(Boolean)];
          return next.length > LOG_MAX_LINES ? next.slice(next.length - LOG_MAX_LINES) : next;
        });
      }
    });
    proc.then(() => setStreaming(false)).catch(() => setStreaming(false));
    return () => { proc.close(); };
  }, [stackName]);

  const stop = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
    setStreaming(false);
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, streaming, stop, clear };
}
