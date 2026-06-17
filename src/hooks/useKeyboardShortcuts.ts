import { useEffect } from "react";

/**
 * Binds keyboard events to a handler map.
 * Automatically skips when the user is typing in a form field or a modal is open.
 *
 * @param handlers - Map of lowercase key to handler function
 * @param deps - Additional dependencies that should trigger re-binding (e.g. stacks array)
 */
export function useKeyboardShortcuts(
  handlers: Record<string, () => void>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  deps: any[] = [],
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select
      const tag = (document.activeElement as HTMLElement)?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (document.activeElement as HTMLElement)?.isContentEditable
      ) return;
      // Skip if a modal is open
      if (document.querySelector(".pf-v6-c-modal-box")) return;

      const key = e.key.toLowerCase();
      const fn = handlers[key];
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
