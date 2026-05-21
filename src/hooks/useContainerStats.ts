import { useState, useCallback, useEffect, useRef } from "react";
import { listContainers, getContainerStats, parsePorts } from "../api";
import type { ComposeContainer, ContainerStats, StackStatus } from "../api";
import { parseJsonOutput } from "../lib/parseJsonOutput";
import { parseDockerBytes } from "../lib/bytes";

export function useContainerStats(stackName: string, status: StackStatus) {
  const [ports, setPorts] = useState<string[]>([]);
  const [stats, setStats] = useState<{ cpu: number; mem: number } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    if (status === "down" || status === "unknown") {
      if (mountedRef.current) { setPorts([]); setStats(null); }
      return;
    }
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const containers = parseJsonOutput<ComposeContainer>(raw);

      const allPorts = new Set<string>();
      const runningIds: string[] = [];
      for (const c of containers) {
        for (const p of parsePorts(c.Ports)) allPorts.add(p);
        if (c.State?.toLowerCase() === "running" && c.ID) runningIds.push(c.ID);
      }
      if (mountedRef.current) setPorts([...allPorts]);

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
