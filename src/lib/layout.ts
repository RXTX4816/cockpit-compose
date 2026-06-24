export type Layout = "minimal" | "poweruser" | "pretty" | "unix";

export const LAYOUT_KEY = "cockpit-compose:layout";

export function isValidLayout(value: unknown): value is Layout {
  return ["minimal", "poweruser", "pretty", "unix"].includes(value as string);
}

