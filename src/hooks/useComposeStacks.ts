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
    if (firstLoadRef.current) {
      setLoading(true);
      firstLoadRef.current = false;
    }
    let raw = "";
    const proc = listStacks();
    proc.stream(data => { raw += data; });
    proc
      .then(() => {
        failCountRef.current = 0;
        setStacks(parseJsonOutput<ComposeStack>(raw));
        setLoading(false);
        setError(null);
      })
      .catch((ex: unknown) => {
        failCountRef.current++;
        setLoading(false);
        // Only surface the error after several consecutive failures so that
        // transient Docker "Internal error" responses during restart/stop/pull
        // don't flash the error banner and kill the refresh interval.
        if (failCountRef.current >= FAIL_THRESHOLD) {
          setError(ex instanceof Error ? ex.message : String(ex));
          setStacks([]);
        }
      });
  }, [tick]);

  return { stacks, loading, error, refresh };
}
