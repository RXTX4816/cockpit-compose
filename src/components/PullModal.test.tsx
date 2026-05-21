import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PullModal } from "./PullModal";
import type { ComposeStack } from "../api";

vi.mock("../hooks/usePullStream", () => ({
  usePullStream: vi.fn(),
}));

import { usePullStream } from "../hooks/usePullStream";
const mockUsePullStream = vi.mocked(usePullStream);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

beforeEach(() => {
  mockUsePullStream.mockReturnValue({
    lines: [],
    done: false,
    failed: false,
    errorMsg: "",
    cancel: vi.fn(),
  });
});

describe("PullModal", () => {
  it("renders modal title with stack name", () => {
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Pull — myapp/i)).toBeInTheDocument();
  });

  it("shows spinner and running status while not done", () => {
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/Pulling images/i)).toBeInTheDocument();
  });

  it("shows Cancel button while not done", () => {
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("shows success state when done and not failed", () => {
    mockUsePullStream.mockReturnValue({
      lines: [],
      done: true,
      failed: false,
      errorMsg: "",
      cancel: vi.fn(),
    });
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Pull complete/i)).toBeInTheDocument();
    // Both modal X and footer Close button match "Close"; check footer primary button
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    expect(closeButtons.some(b => b.classList.contains("pf-m-primary"))).toBe(true);
  });

  it("shows failure state with error message", () => {
    mockUsePullStream.mockReturnValue({
      lines: [],
      done: true,
      failed: true,
      errorMsg: "image not found",
      cancel: vi.fn(),
    });
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Pull failed/i)).toBeInTheDocument();
    expect(screen.getByText(/image not found/i)).toBeInTheDocument();
  });

  it("shows starting pull text when no lines yet", () => {
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Starting pull/i)).toBeInTheDocument();
  });

  it("renders pull output lines", () => {
    mockUsePullStream.mockReturnValue({
      lines: [{ text: "Pulling nginx", kind: "info" }],
      done: false,
      failed: false,
      errorMsg: "",
      cancel: vi.fn(),
    });
    render(<PullModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText("Pulling nginx")).toBeInTheDocument();
  });

  it("calls cancel() and onClose() when Cancel clicked", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUsePullStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel });
    render(<PullModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses first ConfigFile from comma-separated list", () => {
    const multiStack: ComposeStack = { ...stack, ConfigFiles: "/a.yml, /b.yml" };
    mockUsePullStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel: vi.fn() });
    render(<PullModal stack={multiStack} onClose={vi.fn()} />);
    expect(mockUsePullStream).toHaveBeenCalledWith("myapp", "/a.yml");
  });
});
