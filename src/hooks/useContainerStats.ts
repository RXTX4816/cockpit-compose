import { useState, useCallback, useEffect, useRef } from "react";
import { listContainers, getContainerStats, parseJsonOutput } from "../api";
import type { ComposeContainer, ContainerStats, ParsedPort, StackStatus } from "../api";
import { summarizePorts, sumStats } from "../lib/stackSummary";
import { useAutoRefresh } from "./useAutoRefresh";
import { useStackLive, useSharedRead } from "./useStacksLive";

export function useContainerStats(stackName: string, status: StackStatus) {
  const [ports, setPorts] = useState<ParsedPort[]>([]);
  const [stats, setStats] = useState<{ cpu: number; mem: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (status === "stopped" || status === "unknown") {
      if (mountedRef.current) { setPorts([]); setStats(null); }
      return;
    }
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const containers = parseJsonOutput<ComposeContainer>(raw);

      const { ports: found, runningIds } = summarizePorts(containers);
      if (mountedRef.current) setPorts(found);

      if (runningIds.length > 0) {
        let statsRaw = "";
        const statsProc = getContainerStats(runningIds);
        statsProc.stream(d => { statsRaw += d; });
        await statsProc;
        if (mountedRef.current) setStats(sumStats(parseJsonOutput<ContainerStats>(statsRaw)));
      } else {
        if (mountedRef.current) setStats(null);
      }
    } catch {
      // Silently ignore — stats are best-effort
    }
  }, [stackName, status]);

  // A stacks list that polls for all its rows at once (StacksLiveProvider) answers for this stack
  // too; only without one (or when its shared read is unavailable) does the row read for itself.
  const shared = useStackLive(stackName);
  const active = status === "running" || status === "partial";
  const readOwn = !useSharedRead();

  useEffect(() => { if (readOwn) void load(); }, [load, readOwn]);
  useAutoRefresh(load, 10000, !(active && readOwn));

  if (!readOwn) return active && shared ? shared : { ports: [], stats: null };
  return { ports, stats };
}
