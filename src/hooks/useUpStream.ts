import { useState, useEffect, useRef, useCallback } from "react";
import { upStackStream } from "../api";
import { stripAnsi, classifyLine, type LineEntry } from "../lib/pullParser";

export function useUpStream(stackName: string, configFile: string) {
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const bufRef = useRef("");
  const procRef = useRef<CockpitProcess | null>(null);

  useEffect(() => {
    const proc = upStackStream(stackName, configFile);
    procRef.current = proc;

    proc.stream(data => {
      const clean = stripAnsi(data);
      bufRef.current += clean;
      const parts = bufRef.current.split("\n");
      bufRef.current = parts.pop() ?? "";
      const newLines: LineEntry[] = parts
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

    return () => { proc.close(); };
  }, [stackName, configFile]);

  const cancel = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
  }, []);

  return { lines, done, failed, errorMsg, cancel };
}
