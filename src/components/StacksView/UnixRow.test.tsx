import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { UnixRow } from "./UnixRow";
import type { ComposeStack } from "../../api";

vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useServiceActions", () => ({
  useServiceActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("../../hooks/useContainerStats", () => ({
  useContainerStats: vi.fn(),
}));
vi.mock("../../hooks/useAutoRefresh", () => ({
  useAutoRefresh: vi.fn(),
}));
vi.mock("./ContainerTable", () => ({
  ContainerTable: () => <div>ContainerTable</div>,
}));
vi.mock("../LogsModal", () => ({
  LogsModal: () => <div>LogsModal</div>,
}));

import { useStackActions } from "../../hooks/useStackActions";
import { useServiceActions } from "../../hooks/useServiceActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useContainerStats } from "../../hooks/useContainerStats";
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseServiceActions = vi.mocked(useServiceActions);
const mockUseStackContainers = vi.mocked(useStackContainers);
const mockUseContainerStats = vi.mocked(useContainerStats);

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

const stack: ComposeStack = { Name: "myapp", Status: "running(2)", ConfigFiles: "/myapp/compose.yml" };
const stoppedStack: ComposeStack = { Name: "myapp", Status: "exit(0)", ConfigFiles: "/myapp/compose.yml" };

const defaultProps = {
  stack,
  expanded: false,
  onToggle: vi.fn(),
  onLogs: vi.fn(),
  onYaml: vi.fn(),
  onInfo: vi.fn(),
  onDown: vi.fn(),
  onKill: vi.fn(),
  onUp: vi.fn(),
  onPull: vi.fn(),
  onEvents: vi.fn(),
  onTop: vi.fn(),
  onExec: vi.fn(),
  onRun: vi.fn(),
  onPrune: vi.fn(),
  onBackup: vi.fn(),
  onScale: vi.fn(),
  onActingChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction: vi.fn() });
  mockUseServiceActions.mockReturnValue({ actingService: null, doServiceAction: vi.fn() });
  mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: vi.fn(), clear: vi.fn() });
  mockUseContainerStats.mockReturnValue({ ports: [], stats: null });
});

describe("UnixRow", () => {
  it("renders the stack name", () => {
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders RUNNING status for running stack", () => {
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
  });

  it("renders STOPPED status for stopped stack", () => {
    render(<UnixRow {...defaultProps} stack={stoppedStack} />);
    expect(screen.getByText("STOPPED")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows [stop] button for running stack", () => {
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByText("[stop]")).toBeInTheDocument();
  });

  it("shows [up] button for stopped stack", () => {
    render(<UnixRow {...defaultProps} stack={stoppedStack} />);
    expect(screen.getByText("[up]")).toBeInTheDocument();
  });

  it("calls onDown when [down] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[down]"));
    expect(defaultProps.onDown).toHaveBeenCalled();
  });

  it("calls onLogs when [log] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[log]"));
    expect(defaultProps.onLogs).toHaveBeenCalled();
  });

  it("calls onExec when [sh] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[sh]"));
    expect(defaultProps.onExec).toHaveBeenCalled();
  });

  it("calls onYaml when [ed] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[ed]"));
    expect(defaultProps.onYaml).toHaveBeenCalled();
  });

  it("calls onPull when [pull] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[pull]"));
    expect(defaultProps.onPull).toHaveBeenCalled();
  });

  it("calls onInfo when [?] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[?]"));
    expect(defaultProps.onInfo).toHaveBeenCalled();
  });

  it("calls onUp when [up] is clicked for stopped stack", async () => {
    render(<UnixRow {...defaultProps} stack={stoppedStack} />);
    await click(screen.getByText("[up]"));
    expect(defaultProps.onUp).toHaveBeenCalled();
  });

  it("shows stop confirm modal when [stop] is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[stop]"));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
  });

  it("confirms stop and calls doAction", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[stop]"));
    await click(screen.getByRole("button", { name: /^stop$/i }));
    expect(doAction).toHaveBeenCalledWith("stop", expect.any(Function));
  });

  it("opens dropdown menu on more actions button click", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    expect(screen.getByText(/scale/i)).toBeInTheDocument();
  });

  it("calls onScale when Scale is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/scale/i));
    expect(defaultProps.onScale).toHaveBeenCalled();
  });

  it("calls onEvents when Events is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/events/i));
    expect(defaultProps.onEvents).toHaveBeenCalled();
  });

  it("calls onTop when Top is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/^top$/i));
    expect(defaultProps.onTop).toHaveBeenCalled();
  });

  it("calls onRun when Run is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/^run$/i));
    expect(defaultProps.onRun).toHaveBeenCalled();
  });

  it("calls onBackup when Backup is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/backup/i));
    expect(defaultProps.onBackup).toHaveBeenCalled();
  });

  it("calls onPrune when Prune is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/prune/i));
    expect(defaultProps.onPrune).toHaveBeenCalled();
  });

  it("calls onKill when Kill is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/kill/i));
    expect(defaultProps.onKill).toHaveBeenCalled();
  });

  it("shows restart confirm modal when Restart is clicked in dropdown", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/restart/i));
    expect(screen.getByText(/restart "myapp"/i)).toBeInTheDocument();
  });

  it("confirms restart and calls doAction", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/restart/i));
    await click(screen.getByRole("button", { name: /^restart$/i }));
    expect(doAction).toHaveBeenCalledWith("restart", expect.any(Function));
  });

  it("calls doAction pause when Pause is clicked in dropdown", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/^pause$/i));
    expect(doAction).toHaveBeenCalledWith("pause", expect.any(Function));
  });

  it("shows cpu/mem stats when stats are available", () => {
    mockUseContainerStats.mockReturnValue({ ports: [], stats: { cpu: 25.5, mem: 104857600 } });
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByText("25.5%")).toBeInTheDocument();
  });

  it("shows — for cpu/mem when no stats", () => {
    render(<UnixRow {...defaultProps} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders expand button", () => {
    render(<UnixRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: "expand" })).toBeInTheDocument();
  });

  it("calls onToggle when expand button is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByRole("button", { name: "expand" }));
    expect(defaultProps.onToggle).toHaveBeenCalled();
  });

  it("closes stop modal when cancel is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByText("[stop]"));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByText(/stop "myapp"/i)).not.toBeInTheDocument();
  });

  it("closes restart modal when cancel is clicked", async () => {
    render(<UnixRow {...defaultProps} />);
    await click(screen.getByLabelText(/more actions for myapp/i));
    await click(screen.getByText(/restart/i));
    expect(screen.getByText(/restart "myapp"/i)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByText(/restart "myapp"/i)).not.toBeInTheDocument();
  });

  it("renders expanded container table when expanded=true with containers", () => {
    const containers = [{ ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up", Ports: "", Service: "web" }];
    mockUseStackContainers.mockReturnValue({ containers, loading: false, load: vi.fn(), clear: vi.fn() });
    render(<UnixRow {...defaultProps} expanded={true} />);
    expect(screen.getByText("ContainerTable")).toBeInTheDocument();
  });

  it("shows no containers message when expanded and no containers", () => {
    render(<UnixRow {...defaultProps} expanded={true} />);
    expect(screen.getByText(/no containers/i)).toBeInTheDocument();
  });

  it("shows PAUSED status for paused stack", () => {
    render(<UnixRow {...defaultProps} stack={{ ...stack, Status: "paused(2)" }} />);
    expect(screen.getByText("PAUSED")).toBeInTheDocument();
  });

  describe("selection", () => {
    it("does not render a select toggle when onToggleSelect is not provided", () => {
      render(<UnixRow {...defaultProps} />);
      expect(screen.queryByText("[ ]")).not.toBeInTheDocument();
      expect(screen.queryByText("[x]")).not.toBeInTheDocument();
    });

    it("shows [ ] when unselected and [x] when selected, and calls onToggleSelect on click", () => {
      const onToggleSelect = vi.fn();
      const { rerender } = render(<UnixRow {...defaultProps} onToggleSelect={onToggleSelect} isSelected={false} />);
      expect(screen.getByText("[ ]")).toBeInTheDocument();
      fireEvent.click(screen.getByText("[ ]"));
      expect(onToggleSelect).toHaveBeenCalledOnce();

      rerender(<UnixRow {...defaultProps} onToggleSelect={onToggleSelect} isSelected={true} />);
      expect(screen.getByText("[x]")).toBeInTheDocument();
    });
  });
});
