import { useState, useCallback } from "react";
import { type ComposeStack, findComposeFiles, listYamlFilesInDir, readComposeFile, readEnvFile, getProjectNameFromCompose, getComposeProjectNameFromEnv, hasServicesKey } from "../api";

export interface DownedStack {
  name: string;
  configFiles: string[];
}

interface UseDownedStacksScanResult {
  downedStacks: DownedStack[];
  scanning: boolean;
  hasScanned: boolean;
  error: string | null;
  warning: string | null;
  scan: () => void;
  clear: () => void;
  removeStack: (name: string) => void;
  addStack: (stack: DownedStack) => void;
  updateStack: (name: string, updater: (prev: DownedStack) => DownedStack) => void;
}

export function useDownedStacksScan(dir: string, maxDepth: number, existingStacks: ComposeStack[]): UseDownedStacksScanResult {
  const [downedStacks, setDownedStacks] = useState<DownedStack[]>([]);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const scan = useCallback(() => {
    if (!dir.trim()) return;
    setScanning(true);
    setError(null);
    setWarning(null);
    setDownedStacks([]); // clear stale results before new scan

    const activeNames = new Set(existingStacks.map(s => s.Name.toLowerCase()));

    void (async () => {
      try {
        let raw = "";
        const proc = findComposeFiles(dir.trim(), maxDepth);
        proc.stream((data: string) => { raw += data; });

        // find exits non-zero when any directory is unreadable (Permission denied).
        // Collect whatever stdout it produced and only treat it as a hard error
        // when stdout was empty too — meaning nothing at all was scanned.
        let procError: string | null = null;
        try {
          await proc;
        } catch (ex) {
          procError = ex instanceof Error ? ex.message : String(ex);
        }

        const paths = raw.split("\n").map(l => l.trim()).filter(Boolean);

        if (procError !== null && paths.length === 0) {
          throw new Error(procError);
        }

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
              // Find all YAML files in the stack directory and filter to those
              // with a top-level services: key (excludes non-compose YAMLs and empty files)
              const additionalFiles: string[] = [];
              try {
                let lsRaw = "";
                const lsProc = listYamlFilesInDir(stackDir);
                lsProc.stream((d: string) => { lsRaw += d; });
                await lsProc;
                const candidates = lsRaw.split("\n").map(l => l.trim()).filter(Boolean)
                  .filter(p => p !== configFile)
                  .sort();
                for (const candidatePath of candidates) {
                  try {
                    let content = "";
                    const fp = readComposeFile(candidatePath);
                    fp.stream((d: string) => { content += d; });
                    await fp;
                    if (hasServicesKey(content)) additionalFiles.push(candidatePath);
                  } catch {
                    // skip unreadable files
                  }
                }
              } catch {
                // if listing fails, fall back to primary-only
              }
              found.push({ name, configFiles: [configFile, ...additionalFiles] });
            }
          }
        }

        if (procError !== null) setWarning(procError);
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
  }, [dir, maxDepth, existingStacks]);

  const clear = useCallback(() => {
    setDownedStacks([]);
    setError(null);
    setWarning(null);
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

  const updateStack = useCallback((name: string, updater: (prev: DownedStack) => DownedStack) => {
    setDownedStacks(prev => prev.map(d => d.name.toLowerCase() === name.toLowerCase() ? updater(d) : d));
  }, []);

  return { downedStacks, scanning, hasScanned, error, warning, scan, clear, removeStack, addStack, updateStack };
}
