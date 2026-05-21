// docker compose outputs either a JSON array or JSONL (one object per line)
export function parseJsonOutput<T>(raw: string): T[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "null") return [];
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed as T];
  } catch {
    return trimmed
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => JSON.parse(l) as T);
  }
}
