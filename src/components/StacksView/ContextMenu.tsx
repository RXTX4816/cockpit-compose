import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Dropdown, DropdownList } from "@patternfly/react-core";
import type { ContextMenuPosition } from "../../hooks/useContextMenu";

interface Props {
  position: ContextMenuPosition | null;
  onClose: () => void;
  ariaLabel: string;
  /** The layout's own kebab menu items, so both menus always offer the same actions. */
  children: ReactNode;
}

/**
 * A PatternFly Dropdown anchored to a zero-size element at the cursor, so it keeps
 * PatternFly's keyboard handling, focus management and viewport flipping. The anchor is
 * portalled to <body>: cards and rows can be transformed on hover, which would otherwise
 * offset a fixed-position anchor.
 */
export function ContextMenu({ position, onClose, ariaLabel, children }: Props) {
  // A scroll moves the content out from under a cursor-anchored menu; close instead.
  // Escape is handled here too: PatternFly only honours it while focus is inside the
  // menu or on its toggle, and after a mouse right-click focus stays on the stack entry.
  useEffect(() => {
    if (!position) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [position, onClose]);

  // The anchor is rendered here and only its ref goes to PatternFly: a portal returned
  // from Dropdown's toggle render function never mounts, which left the popper with no
  // reference element and the menu stuck in the page's top-left corner.
  const anchorRef = useRef<HTMLButtonElement>(null);

  // Stays mounted with the last position: PatternFly's popper positions itself when
  // isOpen turns true, so mounting it already open left the menu unplaced.
  const [anchor, setAnchor] = useState<ContextMenuPosition>({ x: 0, y: 0 });
  useEffect(() => { if (position) setAnchor(position); }, [position]);

  return (
    <>
      {createPortal(
        <button
          ref={anchorRef}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          style={{ position: "fixed", left: anchor.x, top: anchor.y, width: 0, height: 0, padding: 0, border: 0, opacity: 0, pointerEvents: "none" }}
        />,
        document.body,
      )}
      <Dropdown
        isOpen={position !== null && position.x === anchor.x && position.y === anchor.y}
        onOpenChange={(open: boolean) => { if (!open) onClose(); }}
        shouldFocusFirstItemOnOpen
        toggle={{ toggleNode: null, toggleRef: anchorRef }}
        popperProps={{ appendTo: () => document.body, position: "start" }}
        aria-label={ariaLabel}
      >
        <DropdownList aria-label={ariaLabel}>{children}</DropdownList>
      </Dropdown>
    </>
  );
}
