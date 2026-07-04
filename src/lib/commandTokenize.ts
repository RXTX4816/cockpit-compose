/**
 * Splits a free-text command into argv tokens, respecting single/double
 * quotes (e.g. `sh -c "echo foo bar"` → ["sh", "-c", "echo foo bar"]).
 * Deliberately does not require or invoke a real shell, since minimal/
 * distroless container images often have no shell binary at all.
 */
export function tokenizeCommand(input: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(input)) !== null) {
    tokens.push(match[1] ?? match[2] ?? match[3]);
  }
  return tokens;
}
