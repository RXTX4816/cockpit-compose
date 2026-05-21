import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LogsModal } from "./LogsModal";
import type { ComposeStack } from "../api";

vi.mock("../hooks/useLogStream", () => ({
  useLogStream: vi.fn(),
  LOG_MAX_LINES: 500,
}));

import { useLogStream } from "../hooks/useLogStream";
const mockUseLogStream = vi.mocked(useLogStream);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

beforeEach(() => {
  mockUseLogStream.mockReturnValue({
    lines: [],
    streaming: true,
    stop: vi.fn(),
    clear: vi.fn(),
  });
});

describe("LogsModal", () => {
  it("renders modal with stack name in title", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Logs — myapp/i)).toBeInTheDocument();
  });

  it("shows waiting state when streaming with no lines", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Waiting for logs/i)).toBeInTheDocument();
  });

  it("shows Stop button while streaming", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
  });

  it("calls stop() when Stop button clicked", () => {
    const stop = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, stop, clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("does not show Stop button when not streaming", () => {
    mockUseLogStream.mockReturnValue({ lines: [], streaming: false, stop: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Stop/i })).toBeNull();
  });

  it("shows Clear button when there are lines", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["line1", "line2"],
      streaming: false,
      stop: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Clear/i })).toBeInTheDocument();
  });

  it("calls clear() when Clear button clicked", () => {
    const clear = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: ["line1"], streaming: false, stop: vi.fn(), clear });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it("renders log lines", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["myapp-web-1  | 2024-01-01T00:00:00Z  hello from web"],
      streaming: false,
      stop: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/hello from web/i)).toBeInTheDocument();
  });

  it("shows limit notice when at LOG_MAX_LINES", () => {
    const MAX = 500; // matches LOG_MAX_LINES constant
    mockUseLogStream.mockReturnValue({
      lines: Array.from({ length: MAX }, (_, i) => `line${i}`),
      streaming: false,
      stop: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/showing last/i)).toBeInTheDocument();
  });
});
