import { useState, useEffect, useCallback, useRef } from "react";
import { type ComposeStack, listStacks, parseJsonOutput } from "../api";

interface UseComposeStacksResult {
  stacks: ComposeStack[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  reset: () => void;
}

// How many consecutive failures before we surface an error to the UI.
// Absorbs transient "Internal error" responses from Docker during restart/stop/pull.
// Equivalent to usePollingFetch({ errorThreshold: 4 }) but this hook needs
// streaming output and Docker-specific message rewriting that usePollingFetch doesn't support.
const FAIL_THRESHOLD = 4;

export function useComposeStacks(): UseComposeStacksResult {
  const [stacks, setStacks] = useState<ComposeStack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const firstLoadRef = useRef(true);
  const failCountRef = useRef(0);

  const refresh = useCallback(() => setTick(t => t + 1), []);

  // Clears stacks immediately before fetching — use on runtime switch so that
  // auto-detection in DownedStacksSection doesn't run against stale stacks.
  const reset = useCallback(() => {
    setStacks([]);
    setError(null);
    setLoading(true);
    firstLoadRef.current = true;
    setTick(t => t + 1);
  }, []);

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
          let displayMsg = msg;
          if (msg.toLowerCase().includes("not found") || msg.toLowerCase().includes("no such file")) {
            displayMsg = "Docker not found. Install Docker with the Compose plugin (docker compose v2) to use this plugin.";
          } else if (msg.includes("No such command") || msg.includes("no such command")) {
            displayMsg = "Docker Compose v2 is required but an older version (v1) was detected. Upgrade to Docker Compose v2, or switch to Podman mode.";
          }
          setError(displayMsg);
          setStacks([]);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [tick]);

  return { stacks, loading, error, refresh, reset };
}
