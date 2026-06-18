import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useKeyboardShortcuts } from "./useKeyboardShortcuts";

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
}

describe("useKeyboardShortcuts", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    if (document.activeElement) {
      (document.activeElement as HTMLElement).blur?.();
    }
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("calls the handler for the matching key", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    fireKey("r");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("is case-insensitive (uppercased key matches lowercase handler)", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    fireKey("R");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("does not call handler when an unrelated key is pressed", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    fireKey("x");
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips handler when focus is on an input element", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireKey("r");
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips handler when focus is on a textarea", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();
    fireKey("r");
    expect(handler).not.toHaveBeenCalled();
  });

  it("skips handler when a modal is open", () => {
    const handler = vi.fn();
    renderHook(() => useKeyboardShortcuts({ r: handler }));
    const modal = document.createElement("div");
    modal.className = "pf-v6-c-modal-box";
    document.body.appendChild(modal);
    fireKey("r");
    expect(handler).not.toHaveBeenCalled();
  });

  it("removes listener on unmount", () => {
    const handler = vi.fn();
    const { unmount } = renderHook(() => useKeyboardShortcuts({ r: handler }));
    unmount();
    fireKey("r");
    expect(handler).not.toHaveBeenCalled();
  });
});
