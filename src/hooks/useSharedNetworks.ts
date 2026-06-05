import { useState, useEffect } from "react";
import { type SharedNetwork, listProjectNetworks, listNetworkConnectedProjects } from "../api";

async function streamToLines(proc: CockpitProcess): Promise<string[]> {
  let raw = "";
  proc.stream(d => { raw += d; });
  await proc;
  return raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

async function awaitLines(proc: CockpitProcess): Promise<string[]> {
  const raw = await proc;
  return raw.split("\n").map(l => l.trim()).filter(l => l.length > 0);
}

interface UseSharedNetworksResult {
  sharedNetworks: SharedNetwork[];
  loading: boolean;
  error: string | null;
}

export function useSharedNetworks(stackName: string, enabled: boolean): UseSharedNetworksResult {
  const [sharedNetworks, setSharedNetworks] = useState<SharedNetwork[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !stackName) {
      setSharedNetworks([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    async function load() {
      try {
        const networkNames = await streamToLines(listProjectNetworks(stackName));
        const results: SharedNetwork[] = await Promise.all(
          networkNames.map(async (name): Promise<SharedNetwork> => {
            const projectLines = await awaitLines(listNetworkConnectedProjects(name));
            const sharedWith = [...new Set(projectLines.filter(p => p !== stackName))];
            return { name, sharedWith };
          })
        );
        if (!cancelled) {
          setSharedNetworks(results);
          setLoading(false);
        }
      } catch (ex: unknown) {
        if (!cancelled) {
          setError(ex instanceof Error ? ex.message : String(ex));
          setLoading(false);
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [stackName, enabled]);

  return { sharedNetworks, loading, error };
}
