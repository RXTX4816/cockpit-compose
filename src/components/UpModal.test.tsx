import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UpModal } from "./UpModal";
import type { ComposeStack } from "../api";

vi.mock("../hooks/useUpStream", () => ({
  useUpStream: vi.fn(),
}));

const mockEnqueue = vi.fn();
const mockAdopt = vi.fn();
vi.mock("../hooks/useBackgroundTasks", () => ({
  useBackgroundTasks: () => ({ enqueue: mockEnqueue, adopt: mockAdopt, tasks: [], stop: vi.fn(), remove: vi.fn() }),
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
    detach: vi.fn(() => null),
  });
  mockEnqueue.mockReset();
  mockAdopt.mockReset();
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
      detach: vi.fn(() => null),
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
      detach: vi.fn(() => null),
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
      detach: vi.fn(() => null),
    });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Container myapp-web-1/)).toBeInTheDocument();
  });

  it("calls cancel() and onClose(false) when Cancel clicked while running", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("calls onClose(true) when Close clicked after success", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: false, errorMsg: "", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledWith(true);
  });

  // #272: closing a finished run must not touch the channel. On some VMs that call
  // was observed discarding the still-settling `compose up`, leaving zero containers
  // behind a log that had already printed "Started".
  it("does not cancel the stream when Close is clicked after success", () => {
    const cancel = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: false, errorMsg: "", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(cancel).not.toHaveBeenCalled();
  });

  it("does not cancel the stream when Close is clicked after failure", () => {
    const cancel = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: true, errorMsg: "boom", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(cancel).not.toHaveBeenCalled();
  });

  // #272: the X used to cancel an Up still in flight, silently discarding work the
  // user had confirmed. Dismissing now hands the run to the background instead.
  it("dismissing with the modal X while the run is in flight backgrounds it instead of cancelling", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    const proc = {} as CockpitProcess;
    mockUseUpStream.mockReturnValue({
      lines: [], done: false, failed: false, errorMsg: "", cancel, detach: vi.fn(() => ({ proc, pending: "" })),
    });
    render(<UpModal stack={stack} onClose={onClose} />);
    // The modal's own X, not the footer Cancel button.
    fireEvent.click(screen.getAllByRole("button", { name: /Close/i })[0]);
    expect(cancel).not.toHaveBeenCalled();
    expect(mockAdopt).toHaveBeenCalledWith("myapp", "up", expect.stringContaining("myapp"), proc, [], "");
    expect(onClose).toHaveBeenCalledWith(true);
  });

  // #319: cancelling and relaunching collided with containers the first run had
  // already created, so the task reported Failed for a stack that was running.
  it("Run in Background adopts the running process instead of launching compose up again", () => {
    const cancel = vi.fn();
    const proc = {} as CockpitProcess;
    mockUseUpStream.mockReturnValue({
      lines: [{ text: "Container myapp-web-1 Creating", kind: "info" }], done: false, failed: false, errorMsg: "", cancel,
      detach: vi.fn(() => ({ proc, pending: " Container myapp-web-1 Cre" })),
    } as unknown as ReturnType<typeof useUpStream>);
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Run in Background/i }));
    expect(mockAdopt).toHaveBeenCalledWith(
      "myapp", "up", expect.stringContaining("myapp"), proc,
      ["Container myapp-web-1 Creating"], " Container myapp-web-1 Cre",
    );
    expect(cancel).not.toHaveBeenCalled();
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("calls onClose(false) when Close clicked after failure", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: true, errorMsg: "boom", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledWith(false);
  });

  it("passes all ConfigFiles from comma-separated list to useUpStream", () => {
    const multiStack: ComposeStack = { ...stack, ConfigFiles: "/a.yml, /b.yml" };
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel: vi.fn(), detach: vi.fn(() => null) });
    render(<UpModal stack={multiStack} onClose={vi.fn()} />);
    expect(mockUseUpStream).toHaveBeenCalledWith("myapp", ["/a.yml", "/b.yml"], []);
  });

  it("forwards profiles to useUpStream", () => {
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel: vi.fn(), detach: vi.fn(() => null) });
    render(<UpModal stack={stack} profiles={["dev", "debug"]} onClose={vi.fn()} />);
    expect(mockUseUpStream).toHaveBeenCalledWith("myapp", ["/path/compose.yml"], ["dev", "debug"]);
  });

  it("shows Run in Background button while not done", () => {
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Run in Background/i })).toBeInTheDocument();
  });

  it("does not show Run in Background button when done", () => {
    mockUseUpStream.mockReturnValue({ lines: [], done: true, failed: false, errorMsg: "", cancel: vi.fn(), detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Run in Background/i })).not.toBeInTheDocument();
  });

  it("Run in Background before compose has launched cancels and enqueues a fresh run", () => {
    const cancel = vi.fn();
    const onClose = vi.fn();
    mockUseUpStream.mockReturnValue({ lines: [], done: false, failed: false, errorMsg: "", cancel, detach: vi.fn(() => null) });
    render(<UpModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Run in Background/i }));
    expect(cancel).toHaveBeenCalledOnce();
    expect(mockEnqueue).toHaveBeenCalledWith("myapp", "up", expect.stringContaining("myapp"), expect.any(Function));
    expect(onClose).toHaveBeenCalledWith(true);
  });
});
