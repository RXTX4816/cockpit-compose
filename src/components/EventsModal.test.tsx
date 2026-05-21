import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EventsModal } from "./EventsModal";
import type { ComposeStack } from "../api";
import type { ComposeEvent } from "../api";

vi.mock("../hooks/useEventStream", () => ({
  useEventStream: vi.fn(),
}));

import { useEventStream } from "../hooks/useEventStream";
const mockUseEventStream = vi.mocked(useEventStream);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

const mockEvent: ComposeEvent = {
  time: 1748000000,
  type: "container",
  action: "start",
  actor: { ID: "abc123", Attributes: { "com.docker.compose.service": "web" } },
};

beforeEach(() => {
  mockUseEventStream.mockReturnValue({
    events: [],
    streaming: false,
    error: null,
    start: vi.fn(),
    stop: vi.fn(),
    clear: vi.fn(),
  });
});

describe("EventsModal", () => {
  it("renders modal title with stack name", () => {
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Events — myapp/i)).toBeInTheDocument();
  });

  it("shows Stream events button when not streaming", () => {
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Stream events/i })).toBeInTheDocument();
  });

  it("calls start() when Stream events button clicked", () => {
    const start = vi.fn();
    mockUseEventStream.mockReturnValue({ events: [], streaming: false, error: null, start, stop: vi.fn(), clear: vi.fn() });
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Stream events/i }));
    expect(start).toHaveBeenCalledOnce();
  });

  it("shows Stop button and spinner while streaming", () => {
    mockUseEventStream.mockReturnValue({ events: [], streaming: true, error: null, start: vi.fn(), stop: vi.fn(), clear: vi.fn() });
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("calls stop() when Stop button clicked", () => {
    const stop = vi.fn();
    mockUseEventStream.mockReturnValue({ events: [], streaming: true, error: null, start: vi.fn(), stop, clear: vi.fn() });
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    expect(stop).toHaveBeenCalledOnce();
  });

  it("renders event rows in the table", () => {
    mockUseEventStream.mockReturnValue({
      events: [mockEvent],
      streaming: false,
      error: null,
      start: vi.fn(),
      stop: vi.fn(),
      clear: vi.fn(),
    });
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText("container")).toBeInTheDocument();
    expect(screen.getByText("start")).toBeInTheDocument();
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("shows error alert when error is set", () => {
    mockUseEventStream.mockReturnValue({
      events: [],
      streaming: false,
      error: "stream failed",
      start: vi.fn(),
      stop: vi.fn(),
      clear: vi.fn(),
    });
    render(<EventsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Error streaming events/i)).toBeInTheDocument();
  });

  it("calls stop() and onClose when footer Close button clicked", () => {
    const stop = vi.fn();
    const onClose = vi.fn();
    mockUseEventStream.mockReturnValue({ events: [], streaming: false, error: null, start: vi.fn(), stop, clear: vi.fn() });
    render(<EventsModal stack={stack} onClose={onClose} />);
    // The footer Close button is within the modal footer, not the header X
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    // Click the last one (footer button, not modal header X)
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
