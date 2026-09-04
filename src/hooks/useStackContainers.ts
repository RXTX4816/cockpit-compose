import { useState, useCallback, useEffect, useRef } from "react";
import {
  type ComposeContainer,
  type StackStatus,
  listContainers,
  readComposeFile,
  getServicesFromCompose,
  parseJsonOutput,
} from "../api";


// Service names are re-derived from the compose file(s) on every poll, but those files
// virtually never change while a stack is sitting on the page — so re-reading (and
// re-spawning a process) for them on every tick is wasted work, disproportionately costly
// on constrained hardware. Cache them for a while instead of forever: long enough to avoid
// re-reading on every poll, short enough to still pick up changes made outside this app
// (another tool, an external edit) within a bounded time.
const SERVICE_NAMES_TTL_MS = 30_000;

async function readServiceNames(configFiles: string[]): Promise<string[]> {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const f of configFiles) {
    let content = "";
    const cp = readComposeFile(f);
    cp.stream(d => { content += d; });
    await cp;
    for (const name of getServicesFromCompose(content)) {
      if (!seen.has(name)) { seen.add(name); result.push(name); }
    }
  }
  return result;
}

export function useStackContainers(stackName: string, configFiles: string[], status: StackStatus) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const cachedServiceNamesRef = useRef<string[]>([]);
  const serviceNamesReadAtRef = useRef(0);
  const prevStatusRef = useRef<StackStatus>("unknown");
  const hasDataRef = useRef(false);
  const hasContainersRef = useRef(false);

  // Mark containers stale when status changes so next load re-fetches,
  // but keep existing containers visible to avoid a flash of empty content.
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      hasDataRef.current = false;
    }
  }, [status]);

  const configFilesKey = configFiles.join(",");

  // The caller's config files can change (e.g. a stack's compose file list is edited)
  // independent of the TTL above — force a fresh read the next time that happens.
  useEffect(() => {
    serviceNamesReadAtRef.current = 0;
  }, [configFilesKey]);

  const getServiceNames = useCallback(async (): Promise<string[]> => {
    const isFresh = cachedServiceNamesRef.current.length > 0
      && Date.now() - serviceNamesReadAtRef.current < SERVICE_NAMES_TTL_MS;
    if (isFresh) return cachedServiceNamesRef.current;
    const names = await readServiceNames(configFiles);
    cachedServiceNamesRef.current = names;
    serviceNamesReadAtRef.current = Date.now();
    return names;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configFilesKey]);

  const load = useCallback(async () => {
    if (!hasDataRef.current && !hasContainersRef.current) setLoading(true);
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const running = parseJsonOutput<ComposeContainer>(raw);

      const serviceNames = await getServiceNames();

      hasDataRef.current = true;
      const next = serviceNames.flatMap(name => {
        const cs = running.filter(r => r.Service === name);
        return cs.length > 0 ? cs : [{ ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name }];
      });
      hasContainersRef.current = next.length > 0;
      setContainers(next);
    } catch {
      try {
        const serviceNames = await getServiceNames();
        const fallback = serviceNames.map(name => ({
          ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name,
        }));
        hasContainersRef.current = fallback.length > 0;
        setContainers(fallback);
      } catch {
        const cached = cachedServiceNamesRef.current;
        const last = cached.length > 0
          ? cached.map(name => ({ ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name }))
          : [];
        hasContainersRef.current = last.length > 0;
        setContainers(last);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackName, configFilesKey, getServiceNames]);

  const clear = useCallback(() => { hasDataRef.current = false; hasContainersRef.current = false; setContainers([]); }, []);

  return { containers, loading, load, clear };
}
