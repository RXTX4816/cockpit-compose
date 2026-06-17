import { useState, useEffect, useRef, useCallback } from "react";
import { stripAnsi, classifyLine, type LineEntry } from "../lib/pullParser";

/**
 * General-purpose hook for the "start process → accumulate line-buffered output → classify"
 * pattern that usePullStream and useUpStream both follow.
 *
 * The caller supplies a `startProcess` factory that receives a `launch` callback.
 * The factory must call `launch(proc)` synchronously once the process is ready.
 * This pattern avoids the JS Promise "following" behaviour that would occur if the
 * factory returned the CockpitProcess directly (since CockpitProcess extends Promise,
 * returning it from a .then() causes the runtime to subscribe to it rather than
 * treat it as the resolved value).
 *
 * The `deps` array works like useEffect deps — the hook tears down and restarts the
 * process whenever any dep changes.
 *
 * Example:
 *   useAsyncStream(
 *     launch => someAsyncSetup().then(su => launch(cockpit.spawn(...))),
 *     [dep1, dep2],
 *   )
 */
export function useAsyncStream(
  startProcess: (launch: (proc: CockpitProcess) => void) => Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[],
) {
  const [lines, setLines] = useState<LineEntry[]>([]);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const bufRef = useRef("");
  const procRef = useRef<CockpitProcess | null>(null);

  useEffect(() => {
    let cancelled = false;
    bufRef.current = "";
    setLines([]);
    setDone(false);
    setFailed(false);
    setErrorMsg("");

    const launch = (proc: CockpitProcess) => {
      if (cancelled) { proc.close(); return; }
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
        .then(() => {
          if (!cancelled) { setDone(true); setFailed(false); }
          procRef.current = null;
        })
        .catch((ex: unknown) => {
          if (!cancelled) {
            setDone(true);
            setFailed(true);
            setErrorMsg(ex instanceof Error ? ex.message : String(ex));
          }
          procRef.current = null;
        });
    };

    startProcess(launch).catch((ex: unknown) => {
      if (!cancelled) {
        setDone(true);
        setFailed(true);
        setErrorMsg(ex instanceof Error ? ex.message : String(ex));
      }
    });

    return () => {
      cancelled = true;
      procRef.current?.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const cancel = useCallback(() => {
    procRef.current?.close();
    procRef.current = null;
  }, []);

  return { lines, done, failed, errorMsg, cancel };
}
