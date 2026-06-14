import type { ParsedPort } from "../api/types";

export function getPortUrl(p: ParsedPort): string | null {
  if (p.bindType === "external") {
    return `http://${window.location.hostname}:${p.hostPort}`;
  }
  if (p.bindType === "specific") {
    return `http://${p.bindAddress}:${p.hostPort}`;
  }
  if (p.bindType === "localhost" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return `http://localhost:${p.hostPort}`;
  }
  return null;
}
