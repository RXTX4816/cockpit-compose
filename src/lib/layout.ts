export type Layout = "minimal" | "poweruser" | "pretty" | "unix";

export const LAYOUT_KEY = "cockpit-compose:layout";

export function isValidLayout(value: unknown): value is Layout {
  return ["minimal", "poweruser", "pretty", "unix"].includes(value as string);
}

export function loadLayoutFromStorage(): Layout {
  try {
    const stored = localStorage.getItem(LAYOUT_KEY);
    if (stored && isValidLayout(stored)) return stored as Layout;
  } catch { /* ignore */ }
  return "poweruser";
}
