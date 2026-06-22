export { stripAnsi } from "@rxtx4816/cockpit-plugin-base-react/lib/ansi";

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
