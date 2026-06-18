import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { KillModal } from "./KillModal";
import type { ComposeStack } from "../api";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/myapp/compose.yml" };

describe("KillModal", () => {
  it("renders the stack name in the title", () => {
    render(<KillModal target={stack} killing={false} error={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: /myapp/ })).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(<KillModal target={stack} killing={false} error={null} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /kill/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("calls onClose when cancel button is clicked", () => {
    const onClose = vi.fn();
    render(<KillModal target={stack} killing={false} error={null} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows error alert when error is provided", () => {
    render(<KillModal target={stack} killing={false} error="kill failed" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("kill failed")).toBeInTheDocument();
  });

  it("cancel button is disabled while killing", () => {
    render(<KillModal target={stack} killing={true} error={null} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();
  });

  it("calls onClose when modal close (X) button is clicked and not killing", () => {
    const onClose = vi.fn();
    render(<KillModal target={stack} killing={false} error={null} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not call onClose when modal close (X) button is clicked while killing", () => {
    const onClose = vi.fn();
    render(<KillModal target={stack} killing={true} error={null} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).not.toHaveBeenCalled();
  });
});
