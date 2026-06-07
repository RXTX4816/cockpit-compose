import { useState, useCallback, useEffect, useRef } from "react";
import {
  type ComposeContainer,
  type StackStatus,
  listContainers,
  readComposeFile,
  getServicesFromCompose,
  parseJsonOutput,
} from "../api";


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
  const prevStatusRef = useRef<StackStatus>("unknown");
  const hasDataRef = useRef(false);

  // Clear stale container state when the stack's status changes
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      hasDataRef.current = false;
      setContainers([]);
    }
  }, [status]);

  const configFilesKey = configFiles.join(",");
  const load = useCallback(async () => {
    if (!hasDataRef.current) setLoading(true);
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const running = parseJsonOutput<ComposeContainer>(raw);

      const serviceNames = await readServiceNames(configFiles);
      cachedServiceNamesRef.current = serviceNames;

      hasDataRef.current = true;
      setContainers(serviceNames.map(name => {
        const c = running.find(r => r.Service === name);
        return c ?? { ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name };
      }));
    } catch {
      try {
        const serviceNames = await readServiceNames(configFiles);
        cachedServiceNamesRef.current = serviceNames;
        setContainers(serviceNames.map(name => ({
          ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name,
        })));
      } catch {
        const cached = cachedServiceNamesRef.current;
        setContainers(cached.length > 0
          ? cached.map(name => ({ ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name }))
          : []);
      }
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackName, configFilesKey]);

  const clear = useCallback(() => { hasDataRef.current = false; setContainers([]); }, []);

  return { containers, loading, load, clear };
}
