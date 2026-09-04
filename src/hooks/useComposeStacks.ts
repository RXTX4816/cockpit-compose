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
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

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
      // refresh() (bumping `tick`) returns instantly — it doesn't wait for this fetch to
      // complete. On slow hardware, listStacks() can still be running when the next scheduled
      // refresh() fires, and without this guard a new fetch would start on top of it, piling
      // up subprocess spawns exactly like the un-paced polling this hook was meant to avoid.
      // A tick that arrives while one is already in flight isn't just dropped, though — e.g. a
      // stack action finishing calls refresh() to show the result immediately, and simply
      // discarding that (leaving it to the next *scheduled* poll, now backed off to several
      // seconds on constrained hardware) would make completed actions look stuck. So: skip
      // starting a second concurrent fetch, but remember one more run was requested and run it
      // immediately once the current one finishes, instead of waiting out the full interval.
      if (inFlightRef.current) { pendingRef.current = true; return; }
      inFlightRef.current = true;
      try {
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
      } finally {
        inFlightRef.current = false;
        if (pendingRef.current) {
          pendingRef.current = false;
          // Go through a fresh tick rather than calling load() directly: this closure's own
          // `cancelled` may already be true (e.g. the pending refresh() that set pendingRef
          // is what caused this effect to be torn down in the first place) — calling load()
          // recursively here would immediately hit that stale flag and discard its own
          // results. A new tick mounts a genuinely fresh, uncancelled effect instance.
          setTick(t => t + 1);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [tick]);

  return { stacks, loading, error, refresh, reset };
}
