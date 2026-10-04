// Docker Compose reports warnings on stderr, which Up streams into its log. Two formats
// occur: logfmt from current Compose (`time="…" level=warning msg="service \"web\": …"`),
// and the older `WARN[0000] …` style. Compose 5.6.0 started warning about spec-valid
// attributes that have no effect outside Swarm, which is easy to miss in a long log.

const LOGFMT_RE = /\blevel=warn(?:ing)?\b.*?\bmsg="((?:[^"\\]|\\.)*)"/;
const LEGACY_RE = /^\s*WARN\[\d+\]\s*(.+?)\s*$/;

/** The warning message in a Compose log line, or null if the line is not a warning. */
export function extractComposeWarning(line: string): string | null {
  const logfmt = LOGFMT_RE.exec(line);
  if (logfmt) return logfmt[1].replace(/\\(["\\])/g, "$1");
  const legacy = LEGACY_RE.exec(line);
  return legacy ? legacy[1] : null;
}

/** Every distinct warning in a log, in order of first appearance. */
export function extractComposeWarnings(lines: string[]): string[] {
  const seen = new Set<string>();
  for (const line of lines) {
    const w = extractComposeWarning(line);
    if (w) seen.add(w);
  }
  return [...seen];
}
