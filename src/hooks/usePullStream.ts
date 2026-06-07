import { useState, useEffect, useRef, useCallback } from "react";
import { pullStack, composeFileSuperuser, readAllProfiles } from "../api";
import { stripAnsi, classifyLine, type LineEntry } from "../lib/pullParser";

export function usePullStream(stackName: string, configFiles: string[]) {
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const bufRef = useRef("");
  const procRef = useRef<CockpitProcess | null>(null);

  const configFilesKey = configFiles.join(",");
  useEffect(() => {
    let cancelled = false;
    Promise.all([composeFileSuperuser(configFiles), readAllProfiles(configFiles[0])]).then(([su, profiles]) => {
      if (cancelled) return;
      const proc = pullStack(stackName, configFiles, profiles, su);
      procRef.current = proc;

      proc.stream(data => {
        // Strip ANSI, then handle \r (terminal overwrite) within each chunk
        const clean = stripAnsi(data);
        bufRef.current += clean;
        const parts = bufRef.current.split("\n");
        bufRef.current = parts.pop() ?? "";
        const newLines: LineEntry[] = parts
          // Handle \r within a line — take the last segment (what would be shown in terminal)
          .map(line => line.split("\r").pop() ?? "")
          .filter(line => line.trim() !== "")
          .map(text => ({ text, kind: classifyLine(text) }));
        if (newLines.length > 0) {
          setLines(prev => [...prev, ...newLines]);
        }
      });

      proc
        .then(() => { setDone(true); setFailed(false); procRef.current = null; })
        .catch((ex: unknown) => {
          setDone(true);
          setFailed(true);
          setErrorMsg(ex instanceof Error ? ex.message : String(ex));
          procRef.current = null;
        });
    });

    return () => { cancelled = true; procRef.current?.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackName, configFilesKey]);

  const cancel = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
  }, []);

  return { lines, done, failed, errorMsg, cancel };
}
