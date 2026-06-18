import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LayoutSelector } from "./LayoutSelector";
import { LAYOUT_KEY } from "../lib/layout";

describe("LayoutSelector", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders the trigger button", () => {
    render(<LayoutSelector layout="poweruser" onLayoutChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /change layout/i })).toBeInTheDocument();
  });

  it("opens the layout picker on trigger click", () => {
    render(<LayoutSelector layout="poweruser" onLayoutChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /change layout/i }));
    expect(screen.getByRole("button", { name: /minimal/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /pretty/i })).toBeInTheDocument();
  });

  it("calls onLayoutChange and persists to localStorage when a layout is selected", () => {
    const onLayoutChange = vi.fn();
    render(<LayoutSelector layout="poweruser" onLayoutChange={onLayoutChange} />);
    fireEvent.click(screen.getByRole("button", { name: /change layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /minimal/i }));
    expect(onLayoutChange).toHaveBeenCalledWith("minimal");
    expect(localStorage.getItem(LAYOUT_KEY)).toBe("minimal");
  });

  it("closes the picker after selecting a layout", () => {
    render(<LayoutSelector layout="poweruser" onLayoutChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /change layout/i }));
    fireEvent.click(screen.getByRole("button", { name: /pretty/i }));
    expect(screen.queryByRole("button", { name: /minimal/i })).toBeNull();
  });

  it("closes the picker when clicking outside", () => {
    render(<LayoutSelector layout="poweruser" onLayoutChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /change layout/i }));
    expect(screen.getByRole("button", { name: /minimal/i })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("button", { name: /minimal/i })).toBeNull();
  });
});
