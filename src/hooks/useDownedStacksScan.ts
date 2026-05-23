import { useState, useCallback } from "react";
import { type ComposeStack, findComposeFiles, readComposeFile, readEnvFile, getProjectNameFromCompose, getComposeProjectNameFromEnv } from "../api";

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

    void (async () => {
      try {
        let raw = "";
        const proc = findComposeFiles(dir.trim());
        proc.stream((data: string) => { raw += data; });
        await proc;

        const paths = raw.split("\n").map(l => l.trim()).filter(Boolean);
        const found: DownedStack[] = [];

        for (const configFile of paths) {
          const stackDir = configFile.slice(0, configFile.lastIndexOf("/"));
          let name: string | null = null;

          // Prefer name: from the compose file itself
          try {
            let content = "";
            const fileProc = readComposeFile(configFile);
            fileProc.stream((data: string) => { content += data; });
            await fileProc;
            name = getProjectNameFromCompose(content);
          } catch {
            // ignore read errors, try next source
          }

          // Fall back to COMPOSE_PROJECT_NAME in .env alongside the compose file
          if (!name) {
            try {
              const { content, exists } = await readEnvFile(`${stackDir}/.env`);
              if (exists) name = getComposeProjectNameFromEnv(content);
            } catch {
              // ignore
            }
          }

          // Last resort: directory name (original behaviour)
          if (!name) name = stackDir.slice(stackDir.lastIndexOf("/") + 1);

          if (name && !activeNames.has(name.toLowerCase())) {
            if (!found.some(d => d.name.toLowerCase() === name!.toLowerCase())) {
              found.push({ name, configFile });
            }
          }
        }

        setDownedStacks(found);
        setHasScanned(true);
        setScanning(false);
      } catch (ex) {
        const msg = ex instanceof Error ? ex.message : String(ex);
        setError(msg);
        setDownedStacks([]);
        setHasScanned(false);
        setScanning(false);
      }
    })();
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
