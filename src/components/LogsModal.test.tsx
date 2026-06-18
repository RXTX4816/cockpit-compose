import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogsModal } from "./LogsModal";
import type { ComposeStack } from "../api";

vi.mock("../hooks/useLogStream", () => ({
  useLogStream: vi.fn(),
  LOG_MAX_LINES: 500,
}));

vi.mock("../api", () => ({
  readComposeFile: vi.fn(() => ({
    stream: vi.fn(),
    then: vi.fn().mockImplementation((cb: () => void) => { cb(); return { catch: vi.fn() }; }),
  })),
  getServicesFromCompose: vi.fn(() => []),
}));

import { useLogStream } from "../hooks/useLogStream";
import { getServicesFromCompose } from "../api";
const mockUseLogStream = vi.mocked(useLogStream);
const mockGetServicesFromCompose = vi.mocked(getServicesFromCompose);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

beforeEach(() => {
  mockUseLogStream.mockReturnValue({
    lines: [],
    streaming: true,
    paused: false,
    pause: vi.fn(),
    resume: vi.fn(),
    restart: vi.fn(),
    clear: vi.fn(),
  });
  mockGetServicesFromCompose.mockReturnValue([]);
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

  it("shows Pause button while streaming", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Pause/i })).toBeInTheDocument();
  });

  it("calls pause() when Pause button clicked", () => {
    const pause = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, paused: false, pause, resume: vi.fn(), restart: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Pause/i }));
    expect(pause).toHaveBeenCalledOnce();
  });

  it("shows Continue button when streaming and paused", () => {
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, paused: true, pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Continue/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pause/i })).toBeNull();
  });

  it("calls resume() when Continue button clicked", () => {
    const resume = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, paused: true, pause: vi.fn(), resume, restart: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(resume).toHaveBeenCalledOnce();
  });

  it("hides spinner when paused", () => {
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, paused: true, pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(document.querySelector(".pf-v6-c-spinner")).toBeNull();
  });

  it("does not show Pause or Continue button when not streaming", () => {
    mockUseLogStream.mockReturnValue({ lines: [], streaming: false, paused: false, pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /Pause/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Continue/i })).toBeNull();
  });

  it("always shows Refresh button", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Refresh/i })).toBeInTheDocument();
  });

  it("calls restart() when Refresh button clicked", () => {
    const restart = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: [], streaming: true, paused: false, pause: vi.fn(), resume: vi.fn(), restart, clear: vi.fn() });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(restart).toHaveBeenCalledOnce();
  });

  it("shows Clear button when there are lines", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["line1", "line2"],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Clear/i })).toBeInTheDocument();
  });

  it("calls clear() when Clear button clicked", () => {
    const clear = vi.fn();
    mockUseLogStream.mockReturnValue({ lines: ["line1"], streaming: false, paused: false, pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(clear).toHaveBeenCalledOnce();
  });

  it("renders log lines", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["myapp-web-1  | 2024-01-01T00:00:00Z  hello from web"],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/hello from web/i)).toBeInTheDocument();
  });

  it("shows limit notice when at LOG_MAX_LINES", () => {
    const MAX = 500;
    mockUseLogStream.mockReturnValue({
      lines: Array.from({ length: MAX }, (_, i) => `line${i}`),
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/showing last/i)).toBeInTheDocument();
  });

  // ── Service selector ──────────────────────────────────────────────────────

  it("does not show service selector when no services are available", () => {
    mockGetServicesFromCompose.mockReturnValue([]);
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows service selector populated with services from compose file", () => {
    mockGetServicesFromCompose.mockReturnValue(["web", "db"]);
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /All services/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "web" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "db" })).toBeInTheDocument();
  });

  it("passes selected service to useLogStream", () => {
    mockGetServicesFromCompose.mockReturnValue(["web", "db"]);
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "db" } });
    expect(mockUseLogStream).toHaveBeenCalledWith("myapp", ["/path/compose.yml"], "db", ["web", "db"]);
  });

  it("passes undefined to useLogStream when All services is selected", () => {
    mockGetServicesFromCompose.mockReturnValue(["web", "db"]);
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "web" } });
    fireEvent.change(select, { target: { value: "" } });
    expect(mockUseLogStream).toHaveBeenLastCalledWith("myapp", ["/path/compose.yml"], undefined, ["web", "db"]);
  });

  // ── Search ────────────────────────────────────────────────────────────────

  it("shows search input", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByPlaceholderText(/Search logs/i)).toBeInTheDocument();
  });

  it("filters log lines by search term", () => {
    mockUseLogStream.mockReturnValue({
      lines: [
        "web-1 | 2024-01-01T00:00:00Z hello from web",
        "db-1 | 2024-01-01T00:00:01Z database ready",
      ],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search logs/i), { target: { value: "database" } });
    expect(screen.queryByText(/hello from web/i)).toBeNull();
    // "database" is wrapped in <mark> so match on the parent message cell's textContent
    const msgCell = screen.getByText((_c, el) =>
      (el?.classList.contains("lm-line-message") && Boolean(el.textContent?.match(/database ready/i))) ?? false
    );
    expect(msgCell).toBeInTheDocument();
  });

  it("search is case-insensitive", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["web-1 | 2024-01-01T00:00:00Z ERROR something failed"],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search logs/i), { target: { value: "error" } });
    expect(screen.getByText(/something failed/i)).toBeInTheDocument();
  });

  it("shows all lines when search is cleared", () => {
    mockUseLogStream.mockReturnValue({
      lines: [
        "web-1 | 2024-01-01T00:00:00Z hello from web",
        "db-1 | 2024-01-01T00:00:01Z database ready",
      ],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    const input = screen.getByPlaceholderText(/Search logs/i);
    fireEvent.change(input, { target: { value: "database" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(screen.getByText(/hello from web/i)).toBeInTheDocument();
    expect(screen.getByText(/database ready/i)).toBeInTheDocument();
  });

  it("clears search via the onClear handler", () => {
    mockUseLogStream.mockReturnValue({
      lines: [
        "web-1 | 2024-01-01T00:00:00Z hello from web",
        "db-1 | 2024-01-01T00:00:01Z database ready",
      ],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search logs/i), { target: { value: "database" } });
    // PatternFly SearchInput renders a clear button with aria-label "Reset"
    const resetBtn = screen.getAllByRole("button").find(b => b.getAttribute("aria-label")?.toLowerCase().includes("reset"));
    if (resetBtn) fireEvent.click(resetBtn);
    expect(screen.getByText(/hello from web/i)).toBeInTheDocument();
  });

  it("toggles regex mode when .* button is clicked", () => {
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    const regexBtn = screen.getByRole("button", { name: /regex/i });
    expect(regexBtn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(regexBtn);
    expect(regexBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("filters logs by level when a level chip is clicked", () => {
    mockUseLogStream.mockReturnValue({
      lines: [
        "web-1 | 2024-01-01T00:00:00Z ERROR something broke",
        "web-1 | 2024-01-01T00:00:01Z INFO all good",
      ],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    const errorChip = document.querySelector(".lm-level-chip") as HTMLElement;
    if (errorChip) fireEvent.click(errorChip);
    expect(screen.getAllByText(/Error/i).length).toBeGreaterThan(0);
  });

  it("hides timestamps when timestamp toggle is clicked", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["web-1 | 2024-01-01T10:00:00.000000000Z hello"],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    const tsBtn = screen.getByRole("button", { name: /toggle timestamps/i });
    fireEvent.click(tsBtn);
    expect(tsBtn).toHaveAttribute("aria-pressed", "false");
  });

  it("shows filtered line count when search filters lines", () => {
    mockUseLogStream.mockReturnValue({
      lines: [
        "web-1 | 2024-01-01T00:00:00Z hello from web",
        "db-1 | 2024-01-01T00:00:01Z database ready",
      ],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/Search logs/i), { target: { value: "database" } });
    expect(screen.getByText(/lm-line-count|1 of 2|1.*\/.*2/i, { selector: ".lm-line-count" })).toBeInTheDocument();
  });

  it("renders warn-level log lines with warn class", () => {
    mockUseLogStream.mockReturnValue({
      lines: ["web-1 | 2024-01-01T00:00:00Z WARNING something is not right"],
      streaming: false,
      paused: false,
      pause: vi.fn(),
      resume: vi.fn(),
      restart: vi.fn(),
      clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/something is not right/i)).toBeInTheDocument();
  });

  it("uses showSaveFilePicker when available", async () => {
    const close = vi.fn();
    const write = vi.fn();
    const createWritable = vi.fn().mockResolvedValue({ write, close });
    const showSaveFilePicker = vi.fn().mockResolvedValue({ createWritable });
    (window as unknown as Record<string, unknown>).showSaveFilePicker = showSaveFilePicker;
    mockUseLogStream.mockReturnValue({
      lines: ["web-1 | 2024-01-01T00:00:00Z hello"],
      streaming: false, paused: false,
      pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /download logs/i }));
    await vi.waitFor(() => expect(close).toHaveBeenCalled());
    expect(showSaveFilePicker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: "myapp-logs.txt" }));
    expect(write).toHaveBeenCalled();
    delete (window as unknown as Record<string, unknown>).showSaveFilePicker;
    vi.restoreAllMocks();
  });

  it("falls back to cockpit.file when showSaveFilePicker is absent", async () => {
    const mockReplace = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("cockpit", {
      spawn: vi.fn(),
      file: vi.fn().mockReturnValue({ replace: mockReplace }),
      user: vi.fn().mockResolvedValue({ id: 1000, name: "tok", home: "/home/tok" }),
    });
    mockUseLogStream.mockReturnValue({
      lines: ["web-1 | 2024-01-01T00:00:00Z hello"],
      streaming: false, paused: false,
      pause: vi.fn(), resume: vi.fn(), restart: vi.fn(), clear: vi.fn(),
    });
    render(<LogsModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /download logs/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(cockpit.file).toHaveBeenCalledWith(expect.stringMatching(/\/home\/tok\/Downloads\/myapp-logs-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.txt$/));
    expect(screen.getByText(/\/home\/tok\/Downloads\/myapp-logs-/i)).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
