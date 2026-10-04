import { useCallback, useState, type KeyboardEvent, type MouseEvent } from "react";

export interface ContextMenuPosition {
  x: number;
  y: number;
}

// Places where the browser's own menu matters more than ours: editing text, copying a
// selection, following a link, or anything inside an open dialog.
const NATIVE_MENU_TARGETS = 'input, textarea, select, [contenteditable="true"], a[href], .cm-editor, [role="dialog"]';

/**
 * Opens a stack's actions menu at the cursor on right-click (#334), and at the focused
 * element for the keyboard's context-menu key or Shift+F10.
 *
 * Shift+right-click, text fields, editors, links and selected text keep the browser's
 * native menu.
 */
export function useContextMenu() {
  const [position, setPosition] = useState<ContextMenuPosition | null>(null);

  const onContextMenu = useCallback((e: MouseEvent) => {
    if (e.shiftKey) return;
    if ((e.target as HTMLElement).closest(NATIVE_MENU_TARGETS)) return;
    if (window.getSelection()?.toString()) return;
    e.preventDefault();
    e.stopPropagation();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== "ContextMenu" && !(e.shiftKey && e.key === "F10")) return;
    if ((e.target as HTMLElement).closest(NATIVE_MENU_TARGETS)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.target as HTMLElement).getBoundingClientRect();
    setPosition({ x: r.left + Math.min(24, r.width / 2), y: r.top + r.height / 2 });
  }, []);

  const close = useCallback(() => setPosition(null), []);

  return { position, onContextMenu, onKeyDown, close };
}
