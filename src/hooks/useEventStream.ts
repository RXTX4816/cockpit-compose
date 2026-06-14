import { useState, useRef, useCallback } from "react";
import { streamEvents, type ComposeEvent } from "../api";

export const EVENTS_MAX = 500;

export function useEventStream(project: string) {
  const [events, setEvents] = useState<ComposeEvent[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const procRef = useRef<CockpitProcess | null>(null);
  const bufRef = useRef("");

  const start = useCallback(() => {
    procRef.current?.close();
    bufRef.current = "";
    setEvents([]);
    setError(null);
    setStreaming(true);

    const proc = streamEvents(project);
    procRef.current = proc;

    proc.stream(data => {
      bufRef.current += data;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      const parsed: ComposeEvent[] = [];
      for (const line of parts) {
        if (!line.trim()) continue;
        try {
          // Normalize Docker (lowercase) and Podman (capitalized) event key casing
          const raw = JSON.parse(line) as Record<string, unknown>;
          const ev: ComposeEvent = {
            time:   (raw["time"]   ?? raw["Time"]   ?? "") as string | number,
            type:   (raw["type"]   ?? raw["Type"]   ?? "") as string,
            action: (raw["action"] ?? raw["Action"] ?? "") as string,
            actor:  (raw["actor"]  ?? raw["Actor"]  ?? { ID: "", Attributes: {} }) as ComposeEvent["actor"],
          };
          parsed.push(ev);
        } catch {
          // skip malformed lines
        }
      }
      if (parsed.length > 0) {
        setEvents(prev => {
          const next = [...prev, ...parsed];
          return next.length > EVENTS_MAX ? next.slice(next.length - EVENTS_MAX) : next;
        });
      }
    });

    proc
      .then(() => setStreaming(false))
      .catch((ex: unknown) => {
        setError(ex instanceof Error ? ex.message : String(ex));
        setStreaming(false);
      });
  }, [project]);

  const stop = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
    setStreaming(false);
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, streaming, error, start, stop, clear };
}
