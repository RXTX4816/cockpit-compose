import { useState, useCallback } from "react";
import { type ComposeStack, findComposeFiles } from "../api";

export interface DownedStack {
  name: string;
  configFile: string;
}

interface UseDownedStacksScanResult {
  downedStacks: DownedStack[];
  scanning: boolean;
  hasScanned: boolean;
  error: string | null;
  scan: () => void;
  clear: () => void;
  removeStack: (name: string) => void;
  addStack: (stack: DownedStack) => void;
}

export function useDownedStacksScan(dir: string, existingStacks: ComposeStack[]): UseDownedStacksScanResult {
  const [downedStacks, setDownedStacks] = useState<DownedStack[]>([]);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scan = useCallback(() => {
    if (!dir.trim()) return;
    setScanning(true);
    setError(null);
    setDownedStacks([]); // clear stale results before new scan

    const activeNames = new Set(existingStacks.map(s => s.Name.toLowerCase()));
    let raw = "";
    const proc = findComposeFiles(dir.trim());
    proc.stream((data: string) => { raw += data; });

    void proc.then(() => {
      const paths = raw.split("\n").map(l => l.trim()).filter(Boolean);
      const found: DownedStack[] = [];
      for (const configFile of paths) {
        const stackDir = configFile.slice(0, configFile.lastIndexOf("/"));
        const name = stackDir.slice(stackDir.lastIndexOf("/") + 1);
        if (name && !activeNames.has(name.toLowerCase())) {
          if (!found.some(d => d.name.toLowerCase() === name.toLowerCase())) {
            found.push({ name, configFile });
          }
        }
      }
      setDownedStacks(found);
      setHasScanned(true);
      setScanning(false);
    }).catch((ex: unknown) => {
      const msg = ex instanceof Error ? ex.message : String(ex);
      setError(msg);
      setDownedStacks([]);
      setHasScanned(false);
      setScanning(false);
    });
  }, [dir, existingStacks]);

  const clear = useCallback(() => {
    setDownedStacks([]);
    setError(null);
    setHasScanned(false);
  }, []);

  const removeStack = useCallback((name: string) => {
    setDownedStacks(prev => prev.filter(d => d.name.toLowerCase() !== name.toLowerCase()));
  }, []);

  const addStack = useCallback((stack: DownedStack) => {
    setDownedStacks(prev =>
      prev.some(d => d.name.toLowerCase() === stack.name.toLowerCase()) ? prev : [...prev, stack]
    );
  }, []);

  return { downedStacks, scanning, hasScanned, error, scan, clear, removeStack, addStack };
}
