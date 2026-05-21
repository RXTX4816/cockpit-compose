import { useState, useCallback, useEffect, useRef } from "react";
import {
  type ComposeContainer,
  type StackStatus,
  listContainers,
  readComposeFile,
  getServicesFromCompose,
} from "../api";
import { parseJsonOutput } from "../lib/parseJsonOutput";

export function useStackContainers(stackName: string, configFile: string, status: StackStatus) {
  const [containers, setContainers] = useState<ComposeContainer[]>([]);
  const [loading, setLoading] = useState(false);
  const cachedServiceNamesRef = useRef<string[]>([]);
  const prevStatusRef = useRef<StackStatus>("unknown");

  // Clear stale container state when the stack's status changes
  useEffect(() => {
    if (prevStatusRef.current !== status) {
      prevStatusRef.current = status;
      setContainers([]);
    }
  }, [status]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let raw = "";
      const proc = listContainers(stackName);
      proc.stream(d => { raw += d; });
      await proc;
      const running = parseJsonOutput<ComposeContainer>(raw);

      let composeContent = "";
      const cp = readComposeFile(configFile);
      cp.stream(d => { composeContent += d; });
      await cp;
      const serviceNames = getServicesFromCompose(composeContent);
      cachedServiceNamesRef.current = serviceNames;

      setContainers(serviceNames.map(name => {
        const c = running.find(r => r.Service === name);
        return c ?? { ID: "", Name: name, Image: "", State: "down", Status: "down", Ports: "", Service: name };
      }));
    } catch {
      try {
        let composeContent = "";
        const cp2 = readComposeFile(configFile);
        cp2.stream(d => { composeContent += d; });
        await cp2;
        const serviceNames = getServicesFromCompose(composeContent);
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
  }, [stackName, configFile]);

  const clear = useCallback(() => setContainers([]), []);

  return { containers, loading, load, clear };
}
