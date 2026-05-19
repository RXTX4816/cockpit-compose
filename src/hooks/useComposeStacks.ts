import { useState, useEffect, useCallback, useRef } from "react";
import { type ComposeStack, listStacks, parseJsonOutput } from "../api";

interface UseComposeStacksResult {
  stacks: ComposeStack[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

// How many consecutive failures before we surface an error to the UI.
// This absorbs transient failures from Docker being busy during restarts/stops.
const FAIL_THRESHOLD = 4;

export function useComposeStacks(): UseComposeStacksResult {
  const [stacks, setStacks] = useState<ComposeStack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const firstLoadRef = useRef(true);
  const failCountRef = useRef(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (firstLoadRef.current) {
        setLoading(true);
        firstLoadRef.current = false;
      }
      if (cancelled) return;

      let raw = "";
      const proc = listStacks();
      proc.stream(data => { raw += data; });
      try {
        await proc;
        if (cancelled) return;
        failCountRef.current = 0;
        setStacks(parseJsonOutput<ComposeStack>(raw));
        setLoading(false);
        setError(null);
      } catch (ex: unknown) {
        if (cancelled) return;
        failCountRef.current++;
        setLoading(false);
        // Only surface the error after several consecutive failures so that
        // transient Docker "Internal error" responses during restart/stop/pull
        // don't flash the error banner and kill the refresh interval.
        if (failCountRef.current >= FAIL_THRESHOLD) {
          const msg = ex instanceof Error ? ex.message : String(ex);
          setError(
            msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no such file")
              ? "Docker not found. Install Docker with the Compose plugin (docker compose v2) to use this plugin."
              : msg
          );
          setStacks([]);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [tick]);

  return { stacks, loading, error, refresh };
}
