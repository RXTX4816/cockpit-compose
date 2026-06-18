import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StacksToolbar } from "./StacksToolbar";
import type { ComposeStack } from "../../api";

vi.mock("../RuntimeToggle", () => ({
  RuntimeToggle: ({ onRuntimeChange }: { onRuntimeChange?: (r: string) => void }) => (
    <button onClick={() => onRuntimeChange?.("docker")}>RuntimeToggle</button>
  ),
}));

const stacks: ComposeStack[] = [
  { Name: "app-a", Status: "running(2)", ConfigFiles: "/app-a/compose.yml" },
  { Name: "app-b", Status: "exited(0)", ConfigFiles: "/app-b/compose.yml" },
];

const defaultProps = {
  stacks,
  statusCounts: { running: 1, stopped: 1 },
  activeFilters: new Set<"running" | "partial" | "stopped" | "paused">(),
  searchTerm: "",
  onFilterToggle: vi.fn(),
  onSearchChange: vi.fn(),
  onReset: vi.fn(),
};

beforeEach(() => { vi.clearAllMocks(); });

describe("StacksToolbar", () => {
  it("renders the stacks title", () => {
    render(<StacksToolbar {...defaultProps} />);
    expect(screen.getByRole("heading")).toBeInTheDocument();
  });

  it("renders status filter badges when stacks exist", () => {
    render(<StacksToolbar {...defaultProps} />);
    expect(screen.getByText(/1 running/i)).toBeInTheDocument();
  });

  it("renders the search input", () => {
    render(<StacksToolbar {...defaultProps} />);
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  it("calls onFilterToggle when a filter badge is clicked", () => {
    render(<StacksToolbar {...defaultProps} />);
    fireEvent.click(screen.getByText(/1 running/i));
    expect(defaultProps.onFilterToggle).toHaveBeenCalledWith("running");
  });

  it("calls onSearchChange when search input changes", () => {
    render(<StacksToolbar {...defaultProps} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "foo" } });
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith("foo");
  });

  it("does not show badges when stacks array is empty", () => {
    render(<StacksToolbar {...defaultProps} stacks={[]} statusCounts={{}} />);
    expect(screen.queryByText(/running/)).toBeNull();
  });

  it("calls onReset and onRuntimeChange when RuntimeToggle fires", () => {
    const onReset = vi.fn();
    const onRuntimeChange = vi.fn();
    render(<StacksToolbar {...defaultProps} onReset={onReset} onRuntimeChange={onRuntimeChange} />);
    fireEvent.click(screen.getByText("RuntimeToggle"));
    expect(onReset).toHaveBeenCalled();
    expect(onRuntimeChange).toHaveBeenCalledWith("docker");
  });

  it("calls onSearchChange with empty string when search is cleared", () => {
    render(<StacksToolbar {...defaultProps} searchTerm="foo" />);
    const resetBtn = screen.getAllByRole("button").find(b => b.getAttribute("aria-label")?.toLowerCase().includes("reset"));
    if (resetBtn) fireEvent.click(resetBtn);
    expect(defaultProps.onSearchChange).toHaveBeenCalledWith("");
  });
});
