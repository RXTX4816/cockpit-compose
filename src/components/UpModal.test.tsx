import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpModal } from "./UpModal";
import type { ComposeStack } from "../api";

vi.mock("../hooks/useUpStream", () => ({
  useUpStream: vi.fn(),
}));

import { useUpStream } from "../hooks/useUpStream";
const mockUseUpStream = vi.mocked(useUpStream);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

beforeEach(() => {
  mockUseUpStream.mockReturnValue({
    lines: [],
    done: false,
    failed: false,
    errorMsg: "",
    cancel: vi.fn(),
  });
});

describe("UpModal", () => {
  it("renders modal title with stack name", () => {
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Up — myapp/i)).toBeInTheDocument();
  });

  it("shows spinner and running status while not done", () => {
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/Starting myapp/i)).toBeInTheDocument();
  });

  it("shows Cancel button while not done", () => {
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("shows success state when done and not failed", () => {
    mockUseUpStream.mockReturnValue({
      lines: [],
      done: true,
      failed: false,
      errorMsg: "",
      cancel: vi.fn(),
    });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Up complete/i)).toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    expect(closeButtons.some(b => b.classList.contains("pf-m-primary"))).toBe(true);
  });

  it("shows failure state with error message", () => {
    mockUseUpStream.mockReturnValue({
      lines: [],
      done: true,
      failed: true,
      errorMsg: "permission denied",
      cancel: vi.fn(),
    });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Up failed/i)).toBeInTheDocument();
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
  });

  it("shows starting text when no lines yet", () => {
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Starting…/i)).toBeInTheDocument();
  });

  it("renders up output lines", () => {
    mockUseUpStream.mockReturnValue({
      lines: [{ text: "Container myapp-web-1  Running", kind: "info" }],
      done: false,
      failed: false,
      errorMsg: "",
      cancel: vi.fn(),
    });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Container myapp-web-1/)).toBeInTheDocument();
  });

  it("calls cancel() and onClose(false) when Cancel clicked while running", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel });
    render(<UpModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("calls onClose(true) when Close clicked after success", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: false, errorMsg: "", cancel });
    render(<UpModal stack={stack} onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  it("calls onClose(false) when Close clicked after failure", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: true, errorMsg: "boom", cancel });
    render(<UpModal stack={stack} onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("uses first ConfigFile from comma-separated list", () => {
    const multiStack: ComposeStack = { ...stack, ConfigFiles: "/a.yml, /b.yml" };
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel: vi.fn() });
    render(<UpModal stack={multiStack} onClose={vi.fn()} />);
    expect(mockUseUpStream).toHaveBeenCalledWith("myapp", "/a.yml");
  });
});
