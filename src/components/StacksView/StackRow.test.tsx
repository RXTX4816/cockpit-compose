import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { StackRow } from "./StackRow";
import type { ComposeStack } from "../../api";

vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("./StatsCell", () => ({
  StatsCell: () => <span>StatsCell</span>,
}));

import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseStackContainers = vi.mocked(useStackContainers);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(2)",
  ConfigFiles: "/path/compose.yml",
};

const multiFileStack: ComposeStack = {
  Name: "myapp",
  Status: "running(2)",
  ConfigFiles: "/path/base.yml,/path/override.yml",
};

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
  mockUseStackContainers.mockReturnValue({
    containers: [],
    loading: false,
    load: vi.fn(),
    clear: vi.fn(),
  });
});

describe("StackRow", () => {
  it("renders stack name", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText(/2 services/i)).toBeInTheDocument();
  });

  it("renders Up button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Up/i })).toBeInTheDocument();
  });

  it("renders Stop button when running", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
  });

  it("renders Start button when down", () => {
    render(<StackRow {...defaultProps} stack={{ ...stack, Status: "exit(2)" }} />);
    expect(screen.queryByRole("button", { name: /Stop/i })).toBeNull();
    expect(screen.getByRole("button", { name: /Start/i })).toBeInTheDocument();
  });

  it("renders Logs button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Logs/i })).toBeInTheDocument();
  });

  it("renders Edit button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("calls onLogs when Logs button clicked", () => {
    const onLogs = vi.fn();
    render(<StackRow {...defaultProps} onLogs={onLogs} />);
    fireEvent.click(screen.getByRole("button", { name: /Logs/i }));
    expect(onLogs).toHaveBeenCalledOnce();
  });

  it("calls onYaml when Edit button clicked", () => {
    const onYaml = vi.fn();
    render(<StackRow {...defaultProps} onYaml={onYaml} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(onYaml).toHaveBeenCalledOnce();
  });

  it("calls onToggle when toggle button clicked", () => {
    const onToggle = vi.fn();
    render(<StackRow {...defaultProps} onToggle={onToggle} />);
    // DataListToggle renders with the id we pass: id="toggle-{name}"
    const toggleBtn = document.getElementById("toggle-myapp");
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows action error alert when actionError is set", () => {
    mockUseStackActions.mockReturnValue({
      acting: false,
      actionError: "Failed to start",
      doAction: vi.fn(),
    });
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText("Failed to start")).toBeInTheDocument();
  });

  it("shows spinner when loading containers (expanded)", () => {
    mockUseStackContainers.mockReturnValue({
      containers: [],
      loading: true,
      load: vi.fn(),
      clear: vi.fn(),
    });
    render(<StackRow {...defaultProps} expanded />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows No containers found when expanded with no containers", () => {
    render(<StackRow {...defaultProps} expanded />);
    expect(screen.getByText(/No containers found/i)).toBeInTheDocument();
  });

  it("calls onUp when Up button clicked", () => {
    const onUp = vi.fn();
    render(<StackRow {...defaultProps} onUp={onUp} />);
    fireEvent.click(screen.getByRole("button", { name: /Up/i }));
    expect(onUp).toHaveBeenCalledOnce();
  });

  it("calls doAction with stop when Stop button clicked", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    expect(doAction).toHaveBeenCalledWith("stop", expect.any(Function));
  });

  it("calls doAction with start when Start button clicked on a down stack", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} stack={{ ...stack, Status: "exit(2)" }} />);
    fireEvent.click(screen.getByRole("button", { name: /Start/i }));
    expect(doAction).toHaveBeenCalledWith("start", expect.any(Function));
  });

  it("calls onInfo when Info button clicked", () => {
    const onInfo = vi.fn();
    render(<StackRow {...defaultProps} onInfo={onInfo} />);
    fireEvent.click(screen.getByRole("button", { name: /Info/i }));
    expect(onInfo).toHaveBeenCalledOnce();
  });

  it("opens dropdown when more-actions toggle clicked", async () => {
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    expect(screen.getByRole("menuitem", { name: /Restart/i })).toBeInTheDocument();
    await act(async () => {});
  });

  it("calls doAction with restart when Restart item clicked", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Restart/i }));
    expect(doAction).toHaveBeenCalledWith("restart", expect.any(Function));
    await act(async () => {});
  });

  it("calls onPull when Pull button clicked", () => {
    const onPull = vi.fn();
    render(<StackRow {...defaultProps} onPull={onPull} />);
    fireEvent.click(screen.getByRole("button", { name: /pull latest images/i }));
    expect(onPull).toHaveBeenCalledOnce();
  });

  it("calls onDown when ↓ Down button clicked", () => {
    const onDown = vi.fn();
    render(<StackRow {...defaultProps} onDown={onDown} />);
    fireEvent.click(screen.getByRole("button", { name: /down \(remove containers\)/i }));
    expect(onDown).toHaveBeenCalledOnce();
  });

  it("calls onKill when Kill item clicked", async () => {
    const onKill = vi.fn();
    render(<StackRow {...defaultProps} onKill={onKill} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Kill$/i }));
    expect(onKill).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onEvents when Events item clicked", async () => {
    const onEvents = vi.fn();
    render(<StackRow {...defaultProps} onEvents={onEvents} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Events$/i }));
    expect(onEvents).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onTop when Top item clicked", async () => {
    const onTop = vi.fn();
    render(<StackRow {...defaultProps} onTop={onTop} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Top$/i }));
    expect(onTop).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onExec when Shell item clicked", async () => {
    const onExec = vi.fn();
    render(<StackRow {...defaultProps} onExec={onExec} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Shell$/i }));
    expect(onExec).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onRun when Run item clicked", async () => {
    const onRun = vi.fn();
    render(<StackRow {...defaultProps} onRun={onRun} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Run$/i }));
    expect(onRun).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onPrune when Prune item clicked", async () => {
    const onPrune = vi.fn();
    render(<StackRow {...defaultProps} onPrune={onPrune} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Prune$/i }));
    expect(onPrune).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("shows Prune item before Kill in kebab menu", async () => {
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    const pruneItem = screen.getByRole("menuitem", { name: /^Prune$/i });
    expect(pruneItem).toBeInTheDocument();
    const items = screen.getAllByRole("menuitem");
    const pruneIdx = items.findIndex(el => /^Prune$/i.test(el.textContent ?? ""));
    const killIdx = items.findIndex(el => /^Kill$/i.test(el.textContent ?? ""));
    expect(pruneIdx).toBeLessThan(killIdx);
    // Down is no longer in the dropdown menu — it is a direct button
    expect(screen.queryByRole("menuitem", { name: /Down \(remove\)/i })).not.toBeInTheDocument();
    await act(async () => {});
  });

  it("shows Pause in kebab when running", async () => {
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    expect(screen.getByRole("menuitem", { name: /^Pause$/i })).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows Unpause in kebab when paused", async () => {
    render(<StackRow {...defaultProps} stack={{ ...stack, Status: "paused(2)" }} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    expect(screen.getByRole("menuitem", { name: /^Unpause$/i })).toBeInTheDocument();
    await act(async () => {});
  });

  it("calls doAction with pause when Pause clicked", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Pause$/i }));
    expect(doAction).toHaveBeenCalledWith("pause", expect.any(Function));
    await act(async () => {});
  });

  it("passes full configFiles array to useStackActions for multi-file stack", () => {
    render(<StackRow {...defaultProps} stack={multiFileStack} />);
    expect(mockUseStackActions).toHaveBeenCalledWith(
      "myapp",
      ["/path/base.yml", "/path/override.yml"],
      expect.any(Function),
    );
  });

  it("passes full configFiles array to useStackContainers for multi-file stack", () => {
    render(<StackRow {...defaultProps} stack={multiFileStack} />);
    expect(mockUseStackContainers).toHaveBeenCalledWith(
      "myapp",
      ["/path/base.yml", "/path/override.yml"],
      expect.any(String),
    );
  });

  it("calls doAction with unpause when Unpause clicked", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} stack={{ ...stack, Status: "paused(2)" }} />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Unpause$/i }));
    expect(doAction).toHaveBeenCalledWith("unpause", expect.any(Function));
    await act(async () => {});
  });

  it("afterAction clears containers when not expanded", async () => {
    const clearContainers = vi.fn();
    const loadContainers = vi.fn().mockResolvedValue(undefined);
    let capturedCallback: (() => Promise<void>) | null = null;
    const doAction = vi.fn().mockImplementation((_action: string, cb: () => Promise<void>) => {
      capturedCallback = cb;
      return Promise.resolve();
    });
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: loadContainers, clear: clearContainers });
    render(<StackRow {...defaultProps} expanded={false} />);
    loadContainers.mockClear(); // discard the initial on-mount load
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    await act(async () => { await capturedCallback?.(); });
    expect(clearContainers).toHaveBeenCalled();
    expect(loadContainers).not.toHaveBeenCalled();
  });

  it("afterAction clears and reloads containers when expanded", async () => {
    const clearContainers = vi.fn();
    const loadContainers = vi.fn().mockResolvedValue(undefined);
    let capturedCallback: (() => Promise<void>) | null = null;
    const doAction = vi.fn().mockImplementation((_action: string, cb: () => Promise<void>) => {
      capturedCallback = cb;
      return Promise.resolve();
    });
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: loadContainers, clear: clearContainers });
    render(<StackRow {...defaultProps} expanded />);
    fireEvent.click(screen.getByRole("button", { name: /Stop/i }));
    await act(async () => { await capturedCallback?.(); });
    expect(clearContainers).toHaveBeenCalled();
    expect(loadContainers).toHaveBeenCalled();
  });
});
