import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BulkActionConfirmModal } from "./BulkActionConfirmModal";
import type { ComposeStack } from "../api";

const stacks: ComposeStack[] = [
  { Name: "a", Status: "running(1)", ConfigFiles: "/a/compose.yml" },
  { Name: "b", Status: "stopped", ConfigFiles: "/b/compose.yml" },
];

describe("BulkActionConfirmModal", () => {
  it("lists the affected stack names", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="up" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    expect(screen.getByText("b")).toBeInTheDocument();
  });

  it("shows the stack count and action in the title", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="pull" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Pull 2 stacks\?/i)).toBeInTheDocument();
  });

  it("shows a notice that this will run as background tasks", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="down" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/run as background tasks/i)).toBeInTheDocument();
  });

  it("calls onConfirm when the primary action button is clicked", () => {
    const onConfirm = vi.fn();
    render(<BulkActionConfirmModal stacks={stacks} action="up" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    render(<BulkActionConfirmModal stacks={stacks} action="up" onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows a small warning (not a danger alert) for up", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="up" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/might restart containers and pull new images/i)).toBeInTheDocument();
  });

  it("shows a small warning for restart", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="restart" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/briefly be unavailable/i)).toBeInTheDocument();
  });

  it("shows a prominent danger warning for down", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="down" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/stops and removes all containers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Down$/i })).toHaveClass("pf-m-danger");
  });

  it("shows a prominent danger warning for kill", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="kill" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/forcefully terminates every container/i)).toBeInTheDocument();
    expect(screen.getByText(/SIGKILL/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Kill$/i })).toHaveClass("pf-m-danger");
  });

  it("does not show the destructive warning for non-destructive actions", () => {
    render(<BulkActionConfirmModal stacks={stacks} action="pull" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByText(/SIGKILL/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Pull$/i })).not.toHaveClass("pf-m-danger");
  });
});
