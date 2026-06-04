import { type ReactNode } from "react";

export const SERVICE_COLORS = [
  "#58a6ff", "#56d364", "#d2a8ff", "#ffa657",
  "#f78166", "#e3b341", "#79c0ff", "#3fb950",
];

export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0xffff;
  return h;
}

export function serviceColor(name: string): string {
  return SERVICE_COLORS[hashStr(name) % SERVICE_COLORS.length];
}

export function fmtTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts.slice(11, 16);
    const day   = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year  = d.getFullYear();
    const time  = d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    return `${day}-${month}-${year}\n${time}`;
  } catch {
    return ts.slice(11, 16);
  }
}

// Token types in priority order; first match wins at each position.
export const TOKEN_RE = new RegExp(
  [
    String.raw`\b(FATAL|CRITICAL|ERROR|ERR|WARN(?:ING)?|INFO|DEBUG|TRACE)\b`,
    String.raw`\b5\d{2}\b`,
    String.raw`\b4\d{2}\b`,
    String.raw`\b[23]\d{2}\b`,
    String.raw`"[^"]*"|'[^']*'`,
    String.raw`(?:\/[\w.\-]+){2,}`,
    String.raw`\b\d{1,3}(?:\.\d{1,3}){3}\b`,
  ].join("|"),
  "gi",
);

export function tokenColor(token: string): string {
  const u = token.toUpperCase();
  if (/^(FATAL|CRITICAL|ERROR|ERR)$/.test(u)) return "#f85149";
  if (/^WARN/.test(u)) return "#e3b341";
  if (u === "INFO") return "#79c0ff";
  if (u === "DEBUG") return "#8b949e";
  if (u === "TRACE") return "#6e7681";
  if (/^5\d{2}$/.test(token)) return "#f85149";
  if (/^4\d{2}$/.test(token)) return "#e3b341";
  if (/^[23]\d{2}$/.test(token)) return "#56d364";
  if (token.startsWith('"') || token.startsWith("'")) return "#a5d6ff";
  if (token.startsWith("/")) return "#d2a8ff";
  return "#ffa657";
}

export function tokenWeight(token: string): string | number {
  const u = token.toUpperCase();
  if (/^(FATAL|CRITICAL|ERROR|ERR|WARN)/.test(u)) return 700;
  return "inherit";
}

export function highlightMessage(msg: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  let k = 0;
  TOKEN_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TOKEN_RE.exec(msg)) !== null) {
    if (m.index > last) parts.push(<span key={k++}>{msg.slice(last, m.index)}</span>);
    parts.push(
      <span key={k++} style={{ color: tokenColor(m[0]), fontWeight: tokenWeight(m[0]) }}>
        {m[0]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < msg.length) parts.push(<span key={k++}>{msg.slice(last)}</span>);
  return parts.length ? <>{parts}</> : msg;
}

export interface ParsedLine {
  service: string;
  timestamp: string;
  message: string;
  level: "error" | "warn" | "info" | "debug" | null;
  raw: string;
}

export function parseLine(line: string): ParsedLine {
  const pipeIdx = line.indexOf(" | ");
  if (pipeIdx === -1) {
    return { service: "", timestamp: "", message: line, level: null, raw: line };
  }

  const service = line.slice(0, pipeIdx).trim();
  const rest = line.slice(pipeIdx + 3);

  const tsMatch = rest.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\s*/);
  let timestamp = "";
  let message = rest;
  if (tsMatch) {
    timestamp = fmtTimestamp(tsMatch[1]);
    message = rest.slice(tsMatch[0].length);
  }

  let level: ParsedLine["level"] = null;
  if (/\b(FATAL|CRITICAL|ERROR|ERR)\b/i.test(message)) level = "error";
  else if (/\bWARN(ING)?\b/i.test(message)) level = "warn";
  else if (/\bINFO\b/i.test(message)) level = "info";
  else if (/\bDEBUG\b/i.test(message)) level = "debug";

  return { service, timestamp, message, level, raw: line };
}
