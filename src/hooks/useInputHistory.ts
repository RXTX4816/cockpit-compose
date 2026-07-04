import { useCallback, useState } from "react";

const STORAGE_PREFIX = "cockpit-compose:history:";

function readHistory(key: string): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Tracks a small, browser-local history of previously used values for a free-text
 * field (e.g. Run/Exec command inputs), backed by localStorage under a namespaced
 * key. Entirely client-side — no Cockpit API involved.
 */
export function useInputHistory(storageKey: string, max = 20) {
  const [history, setHistory] = useState<string[]>(() => readHistory(storageKey));

  const record = useCallback((value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setHistory(prev => {
      const next = [trimmed, ...prev.filter(v => v !== trimmed)].slice(0, max);
      try {
        localStorage.setItem(STORAGE_PREFIX + storageKey, JSON.stringify(next));
      } catch { /* localStorage unavailable (e.g. private browsing quota) — history just won't persist */ }
      return next;
    });
  }, [storageKey, max]);

  return { history, record };
}
