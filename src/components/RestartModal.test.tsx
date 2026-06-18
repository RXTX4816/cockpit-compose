import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RestartModal } from "./RestartModal";

describe("RestartModal", () => {
  it("renders the stack name in the title", () => {
    render(<RestartModal stackName="myapp" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp/)).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(<RestartModal stackName="myapp" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /restart/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(<RestartModal stackName="myapp" onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
