import { useMemo } from "react";
import { useAsyncStream as baseUseAsyncStream } from "@rxtx4816/cockpit-plugin-base-react";
import { stripAnsi, classifyLine, type LineEntry } from "../lib/pullParser";

export function useAsyncStream(
  startProcess: (launch: (proc: CockpitProcess) => void) => Promise<void>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[],
) {
  const result = baseUseAsyncStream(startProcess, deps);

  const lines = useMemo(
    () => result.lines.map((text): LineEntry => {
      const clean = stripAnsi(text);
      return { text: clean, kind: classifyLine(clean) };
    }),
    [result.lines],
  );

  return { ...result, lines };
}
