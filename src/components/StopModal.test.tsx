import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StopModal } from "./StopModal";

describe("StopModal", () => {
  it("renders the stack name in the title", () => {
    render(<StopModal stackName="myapp" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp/)).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button clicked", () => {
    const onConfirm = vi.fn();
    render(<StopModal stackName="myapp" onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /stop/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(<StopModal stackName="myapp" onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
