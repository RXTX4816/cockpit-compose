// Build ESC at runtime so no-control-regex doesn't flag a literal control char
const ESC = String.fromCharCode(27);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*[a-zA-Z]`, "g");

export function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export interface LineEntry {
  text: string;
  kind: "info" | "error" | "success" | "dim";
}

export function classifyLine(text: string): LineEntry["kind"] {
  const t = text.trim();
  if (/^(error|err\b)/i.test(t)) return "error";
  if (/✓|done|pulled|complete/i.test(t)) return "success";
  if (/^#\d+\s+(CACHED|DONE)/i.test(t)) return "success";
  // Podman pull output success indicators
  if (/^Copying (blob|config|manifest)/i.test(t)) return "success";
  if (/^Writing manifest/i.test(t)) return "success";
  if (/^Storing signatures/i.test(t)) return "success";
  if (!t) return "dim";
  return "info";
}

export const kindColor: Record<LineEntry["kind"], string> = {
  info: "inherit",
  error: "#f85149",
  success: "#56d364",
  dim: "var(--pf-t--global--text--color--subtle)",
};
