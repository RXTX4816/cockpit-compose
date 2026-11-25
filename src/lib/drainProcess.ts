/**
 * Collects a Cockpit process's streamed output into one string once it completes.
 *
 * Once a `stream` handler is set, Cockpit resolves the process with an empty string and delivers
 * the output only to the handler, so a caller that wants the whole output has to collect it.
 */
export async function drainProcess(proc: CockpitProcess): Promise<string> {
  let raw = "";
  proc.stream((d: string) => { raw += d; });
  await proc;
  return raw;
}
