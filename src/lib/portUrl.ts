import type { ParsedPort } from "../api/types";

function getScheme(p: ParsedPort): string {
  return p.hostPort === "80" || p.containerPort === "80" ? "http" : "https";
}

export function getPortUrl(p: ParsedPort): string | null {
  const scheme = getScheme(p);
  if (p.bindType === "external") {
    return `${scheme}://${window.location.hostname}:${p.hostPort}`;
  }
  if (p.bindType === "specific") {
    return `${scheme}://${p.bindAddress}:${p.hostPort}`;
  }
  if (p.bindType === "localhost" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
    return `${scheme}://localhost:${p.hostPort}`;
  }
  return null;
}
