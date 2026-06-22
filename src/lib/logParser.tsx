export { TOKEN_RE, tokenColor, tokenWeight, highlightMessage } from "@rxtx4816/cockpit-plugin-base-react/lib/logParser";
export { hashStr } from "@rxtx4816/cockpit-plugin-base-react/lib/color";
import { colorForKey } from "@rxtx4816/cockpit-plugin-base-react/lib/color";
export { colorForKey };

export const SERVICE_COLORS = [
  "#58a6ff", "#56d364", "#d2a8ff", "#ffa657",
  "#f78166", "#e3b341", "#79c0ff", "#3fb950",
];

export function serviceColor(name: string): string {
  return colorForKey(name, SERVICE_COLORS);
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
