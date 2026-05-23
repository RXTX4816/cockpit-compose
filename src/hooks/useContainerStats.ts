import { useState, useCallback, useEffect, useRef } from "react";
import { listContainers, getContainerStats, parsePortsFull, parseJsonOutput, parseDockerBytes } from "../api";
import type { ComposeContainer, ContainerStats, ParsedPort, StackStatus } from "../api";

const BIND_PRIORITY: Record<ParsedPort["bindType"], number> = { external: 3, specific: 2, localhost: 1 };

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

      const portMap = new Map<string, ParsedPort>();
      const runningIds: string[] = [];
      for (const c of containers) {
        for (const p of parsePortsFull(c.Ports)) {
          const existing = portMap.get(p.label);
          if (!existing || BIND_PRIORITY[p.bindType] > BIND_PRIORITY[existing.bindType]) portMap.set(p.label, p);
        }
        if (c.State?.toLowerCase() === "running" && c.ID) runningIds.push(c.ID);
      }
      if (mountedRef.current) setPorts([...portMap.values()]);

      if (runningIds.length > 0) {
        let statsRaw = "";
        const statsProc = getContainerStats(runningIds);
        statsProc.stream(d => { statsRaw += d; });
        await statsProc;
        const statsData = parseJsonOutput<ContainerStats>(statsRaw);

        let totalCPU = 0;
        let totalMem = 0;
        for (const s of statsData) {
          totalCPU += parseFloat(s.cpu || "0");
          const [used] = (s.mem || "0B / 0B").split(" / ");
          totalMem += parseDockerBytes(used);
        }
        if (mountedRef.current) setStats({ cpu: totalCPU, mem: totalMem });
      } else {
        if (mountedRef.current) setStats(null);
      }
    } catch {
      // Silently ignore — stats are best-effort
    }
  }, [stackName, status]);

  useEffect(() => {
    void load();
    if (status === "running" || status === "partial") {
      const t = setInterval(() => void load(), 10000);
      return () => clearInterval(t);
    }
  }, [load, status]);

  return { ports, stats };
}
