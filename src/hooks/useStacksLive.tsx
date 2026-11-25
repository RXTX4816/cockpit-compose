import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { listAllStackContainers, getAllContainerStats } from "../api";
import type { ParsedPort } from "../api";
import { summarizePorts, sumStats } from "../lib/stackSummary";

/** What the stacks list shows for one stack besides its status: published ports and CPU/memory. */
export interface StackLive {
  ports: ParsedPort[];
  stats: { cpu: number; mem: number } | null;
}

interface LiveState {
  /** The shared read has not failed (or has not run yet): rows should wait for it instead of reading for themselves. */
  shared: boolean;
  data: Map<string, StackLive> | null;
}

const LiveContext = createContext<LiveState | null>(null);

interface Props {
  /** Poll only while some stack is running. */
  enabled: boolean;
  intervalMs?: number;
  children: ReactNode;
}

/**
 * One poller for the whole stacks list. Every row used to read its own containers and stats on
 * its own timer, so a page of N stacks cost N reads every few seconds; this asks the engine for
 * all of them at once and hands each stack its share through `useStackLive`.
 *
 * When the engine cannot be asked in one go (no usable socket), nothing is published and each
 * row falls back to reading for itself.
 */
export function StacksLiveProvider({ enabled, intervalMs = 10_000, children }: Props) {
  const [live, setLive] = useState<Map<string, StackLive> | null>(null);
  const [failed, setFailed] = useState(false);
  const inFlight = useRef(false);

  const load = useCallback(async (isCancelled: () => boolean) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const byProject = await listAllStackContainers();
      const summaries = new Map<string, ReturnType<typeof summarizePorts>>();
      const running: string[] = [];
      for (const [project, containers] of byProject) {
        const s = summarizePorts(containers);
        summaries.set(project, s);
        running.push(...s.runningIds);
      }
      let samples: Awaited<ReturnType<typeof getAllContainerStats>> = [];
      if (running.length > 0) {
        try { samples = await getAllContainerStats(running); } catch { /* stats are best-effort */ }
      }
      const byId = new Map(samples.map(s => [s.id, s]));
      const next = new Map<string, StackLive>();
      for (const [project, s] of summaries) {
        next.set(project, { ports: s.ports, stats: sumStats(s.runningIds.flatMap(id => byId.get(id) ?? [])) });
      }
      if (!isCancelled()) { setLive(next); setFailed(false); }
    } catch {
      if (!isCancelled()) { setLive(null); setFailed(true); }
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    void load(isCancelled);
    const timer = setInterval(() => { void load(isCancelled); }, intervalMs);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled, intervalMs, load]);

  const value = useMemo<LiveState>(() => ({ shared: enabled && !failed, data: live }), [enabled, failed, live]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

/**
 * True while a stacks list reads for all its rows at once: a row then waits for `useStackLive`
 * instead of reading for itself. False without a provider, while it is off, and once its shared
 * read has failed (no usable engine socket), when each row falls back to its own read.
 */
export function useSharedRead(): boolean {
  return useContext(LiveContext)?.shared ?? false;
}

/**
 * The shared snapshot for one stack: empty data for a stack the engine lists no containers for,
 * and `undefined` until the first shared read finishes, or when there is none.
 */
export function useStackLive(stackName: string): StackLive | undefined {
  const data = useContext(LiveContext)?.data ?? null;
  return useMemo(() => {
    if (!data) return undefined;
    return data.get(stackName) ?? { ports: [], stats: null };
  }, [data, stackName]);
}
