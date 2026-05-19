export function parseDockerBytes(s: string): number {
  const m = s.match(/^([\d.]+)\s*(B|kB|KB|MB|MiB|GB|GiB|TB|TiB)?/i);
  if (!m) return 0;
  const val = parseFloat(m[1]);
  const multipliers: Record<string, number> = {
    b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12,
    mib: 1048576, gib: 1073741824, tib: 1099511627776,
  };
  return val * (multipliers[(m[2] || "B").toLowerCase()] || 1);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)}KiB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)}MiB`;
  return `${(bytes / 1073741824).toFixed(2)}GiB`;
}
