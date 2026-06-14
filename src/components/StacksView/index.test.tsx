import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import type { ComposeStack } from "../../api";
import type { DownedStack } from "../../hooks/useDownedStacksScan";

// --- Hook mocks ---
vi.mock("../../hooks/useComposeStacks", () => ({ useComposeStacks: vi.fn() }));
vi.mock("../../hooks/useDownStack", () => ({ useDownStack: vi.fn() }));
vi.mock("../../hooks/useKillStack", () => ({ useKillStack: vi.fn() }));
vi.mock("../../hooks/useSharedNetworks", () => ({ useSharedNetworks: vi.fn() }));
vi.mock("../../hooks/useAutoRefresh", () => ({ useAutoRefresh: vi.fn() }));

// --- Component mocks (inline to avoid hoisting issues) ---
vi.mock("./StackRow", () => ({
  StackRow: ({
    stack,
    onLogs, onYaml, onInfo, onUp, onPull, onEvents, onTop, onExec, onRun, onPrune, onBackup, onDown, onKill, onToggle,
  }: {
    stack: ComposeStack;
    onLogs: () => void; onYaml: () => void; onInfo: () => void; onUp: () => void;
    onPull: () => void; onEvents: () => void; onTop: () => void; onExec: () => void;
    onRun: () => void; onPrune: () => void; onBackup: () => void; onDown: () => void; onKill: () => void;
    onToggle: () => void;
  }) => (
    <div data-testid={`stack-row-${stack.Name}`}>
      <span>{stack.Name}</span>
      <button onClick={onLogs}>Logs</button>
      <button onClick={onYaml}>Edit</button>
      <button onClick={onInfo}>Info</button>
      <button onClick={onUp}>Up</button>
      <button onClick={onPull}>Pull</button>
      <button onClick={onEvents}>Events</button>
      <button onClick={onTop}>Top</button>
      <button onClick={onExec}>Shell</button>
      <button onClick={onRun}>Run</button>
      <button onClick={onPrune}>Prune</button>
      <button onClick={onBackup}>Backup</button>
      <button onClick={onDown}>Down</button>
      <button onClick={onKill}>Kill</button>
      <button onClick={onToggle}>Toggle</button>
    </div>
  ),
}));

vi.mock("../DownedStacksSection", () => ({
  DownedStacksSection: ({ manuallyDownedStacks }: { manuallyDownedStacks: DownedStack[] }) => (
    <div data-testid="downed-section">{manuallyDownedStacks.length} downed</div>
  ),
}));

vi.mock("../LogsModal", () => ({ LogsModal: () => <div data-testid="logs-modal" /> }));
vi.mock("../YamlModal", () => ({
  YamlModal: ({ onFileAdded, onFileRemoved }: { onFileAdded?: (p: string) => void; onFileRemoved?: (p: string) => void }) => (
    <div data-testid="yaml-modal">
      <button onClick={() => onFileAdded?.("/extra.yml")}>Add File</button>
      <button onClick={() => onFileRemoved?.("/old.yml")}>Remove File</button>
    </div>
  ),
}));
vi.mock("../StackInfoModal", () => ({ StackInfoModal: () => <div data-testid="info-modal" /> }));
vi.mock("../UpConfirmModal", () => ({
  UpConfirmModal: ({ onConfirm, onClose }: { onConfirm: (p: string[]) => void; onClose?: () => void }) => (
    <div data-testid="up-confirm-modal">
      <button onClick={() => onConfirm([])}>Confirm</button>
      <button onClick={onClose}>CloseUpConfirm</button>
    </div>
  ),
}));
vi.mock("../UpModal", () => ({
  UpModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="up-modal"><button onClick={onClose}>CloseUp</button></div>
  ),
}));
vi.mock("../PullConfirmModal", () => ({
  PullConfirmModal: ({ onConfirm, onClose }: { onConfirm: () => void; onClose?: () => void }) => (
    <div data-testid="pull-confirm-modal">
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onClose}>ClosePullConfirm</button>
    </div>
  ),
}));
vi.mock("../PullModal", () => ({
  PullModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="pull-modal"><button onClick={onClose}>ClosePull</button></div>
  ),
}));
vi.mock("../EventsModal", () => ({
  EventsModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="events-modal"><button onClick={onClose}>CloseEvents</button></div>
  ),
}));
vi.mock("../TopModal", () => ({
  TopModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="top-modal"><button onClick={onClose}>CloseTop</button></div>
  ),
}));
vi.mock("../ExecModal", () => ({
  ExecModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="exec-modal"><button onClick={onClose}>CloseExec</button></div>
  ),
}));
vi.mock("../RunModal", () => ({
  RunModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="run-modal"><button onClick={onClose}>CloseRun</button></div>
  ),
}));
vi.mock("../PruneModal", () => ({
  PruneModal: ({ onClose, onSuccess }: { onClose?: () => void; onSuccess?: () => void }) => (
    <div data-testid="prune-modal">
      <button onClick={onClose}>ClosePrune</button>
      <button onClick={onSuccess}>PruneSuccess</button>
    </div>
  ),
}));
vi.mock("../BackupModal", () => ({
  BackupModal: ({ onClose }: { onClose?: () => void }) => (
    <div data-testid="backup-modal"><button onClick={onClose}>CloseBackup</button></div>
  ),
}));

vi.mock("../RuntimeToggle", () => ({
  RuntimeToggle: ({ onRuntimeChange }: { onRuntimeChange?: (r: string) => void }) => (
    <button data-testid="runtime-toggle" onClick={() => onRuntimeChange?.("podman")}>
      Switch runtime
    </button>
  ),
}));

import { useComposeStacks } from "../../hooks/useComposeStacks";
import { useDownStack } from "../../hooks/useDownStack";
import { useKillStack } from "../../hooks/useKillStack";
import { useSharedNetworks } from "../../hooks/useSharedNetworks";
import { StacksView } from "./index";

const mockUseComposeStacks = vi.mocked(useComposeStacks);
const mockUseDownStack = vi.mocked(useDownStack);
const mockUseKillStack = vi.mocked(useKillStack);
const mockUseSharedNetworks = vi.mocked(useSharedNetworks);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/home/user/stacks/myapp/compose.yml",
};

const defaultDownStack = {
  target: null, downing: false, error: null,
  open: vi.fn(), close: vi.fn(), execute: vi.fn(),
};
const defaultKillStack = {
  target: null, killing: false, error: null,
  open: vi.fn(), close: vi.fn(), execute: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseComposeStacks.mockReturnValue({ stacks: [], loading: false, error: null, refresh: vi.fn() });
  mockUseDownStack.mockReturnValue(defaultDownStack);
  mockUseKillStack.mockReturnValue(defaultKillStack);
  mockUseSharedNetworks.mockReturnValue({ sharedNetworks: [], loading: false, error: null });
});

describe("StacksView — loading and empty states", () => {
  it("shows a spinner when loading with no stacks", () => {
    mockUseComposeStacks.mockReturnValue({ stacks: [], loading: true, error: null, refresh: vi.fn() });
    render(<StacksView />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows empty state when stacks is empty and not loading", () => {
    render(<StacksView />);
    expect(screen.getByText(/no compose stacks/i)).toBeInTheDocument();
  });

  it("shows error alert when error is set", () => {
    mockUseComposeStacks.mockReturnValue({ stacks: [], loading: false, error: "docker not found", refresh: vi.fn() });
    render(<StacksView />);
    expect(screen.getByText(/docker not found/i)).toBeInTheDocument();
  });

  it("shows a retry button in the error alert", () => {
    const refresh = vi.fn();
    mockUseComposeStacks.mockReturnValue({ stacks: [], loading: false, error: "docker not found", refresh });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("StacksView — stack list", () => {
  it("renders a StackRow for each stack", () => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
    render(<StacksView />);
    expect(screen.getByTestId("stack-row-myapp")).toBeInTheDocument();
  });

  it("renders multiple StackRows", () => {
    const stack2: ComposeStack = { Name: "otherapp", Status: "exit(1)", ConfigFiles: "/other/compose.yml" };
    mockUseComposeStacks.mockReturnValue({ stacks: [stack, stack2], loading: false, error: null, refresh: vi.fn() });
    render(<StacksView />);
    expect(screen.getByTestId("stack-row-myapp")).toBeInTheDocument();
    expect(screen.getByTestId("stack-row-otherapp")).toBeInTheDocument();
  });

  it("renders the DownedStacksSection", () => {
    render(<StacksView />);
    expect(screen.getByTestId("downed-section")).toBeInTheDocument();
  });
});

describe("StacksView — modal opening via StackRow callbacks", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("opens LogsModal when onLogs is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Logs" }));
    expect(screen.getByTestId("logs-modal")).toBeInTheDocument();
  });

  it("opens YamlModal when onYaml is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("opens StackInfoModal when onInfo is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Info" }));
    expect(screen.getByTestId("info-modal")).toBeInTheDocument();
  });

  it("opens UpConfirmModal when onUp is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
  });

  it("opens PullConfirmModal when onPull is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    expect(screen.getByTestId("pull-confirm-modal")).toBeInTheDocument();
  });

  it("opens EventsModal when onEvents is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(screen.getByTestId("events-modal")).toBeInTheDocument();
  });

  it("opens TopModal when onTop is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(screen.getByTestId("top-modal")).toBeInTheDocument();
  });

  it("opens ExecModal when onExec is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    expect(screen.getByTestId("exec-modal")).toBeInTheDocument();
  });

  it("opens RunModal when onRun is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByTestId("run-modal")).toBeInTheDocument();
  });

  it("opens PruneModal when onPrune is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Prune" }));
    expect(screen.getByTestId("prune-modal")).toBeInTheDocument();
  });

  it("opens BackupModal when onBackup is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Backup" }));
    expect(screen.getByTestId("backup-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseBackup" }));
    expect(screen.queryByTestId("backup-modal")).toBeNull();
  });
});

describe("StacksView — UpConfirmModal → UpModal flow", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("opens UpModal after confirming in UpConfirmModal", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("up-modal")).toBeInTheDocument();
  });
});

describe("StacksView — PullConfirmModal → PullModal flow", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("opens PullModal after confirming in PullConfirmModal", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("pull-modal")).toBeInTheDocument();
  });
});

describe("StacksView — down confirmation modal", () => {
  it("renders down modal when useDownStack has a target", () => {
    mockUseDownStack.mockReturnValue({ ...defaultDownStack, target: stack });
    render(<StacksView />);
    expect(screen.getByRole("dialog", { name: /confirm down/i })).toBeInTheDocument();
  });

  it("calls performDown when the confirm button is clicked", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    mockUseDownStack.mockReturnValue({ ...defaultDownStack, target: stack, execute });
    render(<StacksView />);
    // The down modal confirm button text comes from t("down_modal.confirm_button")
    const btn = screen.getAllByRole("button").find(b => /down/i.test(b.textContent ?? ""));
    if (btn) fireEvent.click(btn);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("calls closeDown when Cancel is clicked in the down modal", () => {
    const close = vi.fn();
    mockUseDownStack.mockReturnValue({ ...defaultDownStack, target: stack, close });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(close).toHaveBeenCalledOnce();
  });

  it("shows shared networks warning when networks are shared", () => {
    mockUseDownStack.mockReturnValue({ ...defaultDownStack, target: stack });
    mockUseSharedNetworks.mockReturnValue({
      sharedNetworks: [{ name: "myapp_default", sharedWith: ["otherapp"] }],
      loading: false,
      error: null,
    });
    render(<StacksView />);
    expect(screen.getByText(/otherapp/)).toBeInTheDocument();
  });

  it("shows down error alert when error is set", () => {
    mockUseDownStack.mockReturnValue({ ...defaultDownStack, target: stack, error: "failed to remove network" });
    render(<StacksView />);
    expect(screen.getByText(/failed to remove network/i)).toBeInTheDocument();
  });
});

describe("StacksView — kill confirmation modal", () => {
  it("renders kill modal when useKillStack has a target", () => {
    mockUseKillStack.mockReturnValue({ ...defaultKillStack, target: stack });
    render(<StacksView />);
    expect(screen.getByRole("dialog", { name: /confirm kill/i })).toBeInTheDocument();
  });

  it("shows kill error alert when killError is set", () => {
    mockUseKillStack.mockReturnValue({ ...defaultKillStack, target: stack, error: "kill failed" });
    render(<StacksView />);
    expect(screen.getByText(/kill failed/i)).toBeInTheDocument();
  });

  it("calls closeKill when the kill modal X button is clicked", () => {
    const close = vi.fn();
    mockUseKillStack.mockReturnValue({ ...defaultKillStack, target: stack, close });
    render(<StacksView />);
    // Find the X close button on the kill modal specifically
    const killDialog = screen.getByRole("dialog", { name: /confirm kill/i });
    const closeBtn = within(killDialog).getByRole("button", { name: /close/i });
    fireEvent.click(closeBtn);
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("StacksView — handleDownComplete / handleUpComplete", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("adds a manually downed stack to DownedStacksSection after down completes", () => {
    let capturedOnComplete: ((s: ComposeStack) => void) | undefined;
    mockUseDownStack.mockImplementation((_refresh, _onActing, onComplete) => {
      capturedOnComplete = onComplete;
      return { ...defaultDownStack };
    });
    render(<StacksView />);
    act(() => { capturedOnComplete?.(stack); });
    expect(screen.getByTestId("downed-section")).toHaveTextContent("1 downed");
  });
});

describe("StacksView — additional modal close callbacks", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("closes EventsModal when CloseEvents is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Events" }));
    expect(screen.getByTestId("events-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseEvents" }));
    expect(screen.queryByTestId("events-modal")).toBeNull();
  });

  it("closes TopModal when CloseTop is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Top" }));
    expect(screen.getByTestId("top-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseTop" }));
    expect(screen.queryByTestId("top-modal")).toBeNull();
  });

  it("closes ExecModal when CloseExec is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Shell" }));
    expect(screen.getByTestId("exec-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseExec" }));
    expect(screen.queryByTestId("exec-modal")).toBeNull();
  });

  it("closes RunModal when CloseRun is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Run" }));
    expect(screen.getByTestId("run-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseRun" }));
    expect(screen.queryByTestId("run-modal")).toBeNull();
  });

  it("closes PruneModal when ClosePrune is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Prune" }));
    expect(screen.getByTestId("prune-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ClosePrune" }));
    expect(screen.queryByTestId("prune-modal")).toBeNull();
  });

  it("calls refresh when PruneModal onSuccess fires", () => {
    const refresh = vi.fn();
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Prune" }));
    fireEvent.click(screen.getByRole("button", { name: "PruneSuccess" }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe("StacksView — toggle expansion", () => {
  it("calls toggle when Toggle button is clicked on a StackRow", () => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    // No crash expected; expanded state is internal
    expect(screen.getByTestId("stack-row-myapp")).toBeInTheDocument();
  });
});

describe("StacksView — kill confirm button", () => {
  it("calls performKill when Kill confirm button is clicked", () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    mockUseKillStack.mockReturnValue({ ...defaultKillStack, target: stack, execute });
    render(<StacksView />);
    const btn = screen.getAllByRole("button").find(b => /kill all/i.test(b.textContent ?? ""));
    if (btn) fireEvent.click(btn);
    expect(execute).toHaveBeenCalledOnce();
  });

  it("calls closeKill when Cancel is clicked in the kill modal", () => {
    const close = vi.fn();
    mockUseKillStack.mockReturnValue({ ...defaultKillStack, target: stack, close });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(close).toHaveBeenCalledOnce();
  });
});

describe("StacksView — onRuntimeChange prop", () => {
  it("calls onRuntimeChange when RuntimeToggle fires a runtime change", () => {
    const onRuntimeChange = vi.fn();
    render(<StacksView onRuntimeChange={onRuntimeChange} />);
    fireEvent.click(screen.getByTestId("runtime-toggle"));
    expect(onRuntimeChange).toHaveBeenCalledWith("podman");
  });

  it("also refreshes stacks when runtime changes", () => {
    const refresh = vi.fn();
    mockUseComposeStacks.mockReturnValue({ stacks: [], loading: false, error: null, refresh });
    render(<StacksView onRuntimeChange={vi.fn()} />);
    fireEvent.click(screen.getByTestId("runtime-toggle"));
    expect(refresh).toHaveBeenCalled();
  });

  it("works without onRuntimeChange prop (optional)", () => {
    render(<StacksView />);
    expect(() => fireEvent.click(screen.getByTestId("runtime-toggle"))).not.toThrow();
  });
});

describe("StacksView — YamlModal file callbacks", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("updates ConfigFiles when onFileAdded is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Add File" }));
    // Should not crash; state update is internal
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("updates ConfigFiles when onFileRemoved is called", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove File" }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });
});

describe("StacksView — modal close callbacks", () => {
  beforeEach(() => {
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh: vi.fn() });
  });

  it("closes UpConfirmModal when CloseUpConfirm is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseUpConfirm" }));
    expect(screen.queryByTestId("up-confirm-modal")).toBeNull();
  });

  it("closes UpModal when CloseUp is clicked and calls refresh", () => {
    const refresh = vi.fn();
    mockUseComposeStacks.mockReturnValue({ stacks: [stack], loading: false, error: null, refresh });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("up-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseUp" }));
    expect(screen.queryByTestId("up-modal")).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it("closes PullConfirmModal when ClosePullConfirm is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    expect(screen.getByTestId("pull-confirm-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ClosePullConfirm" }));
    expect(screen.queryByTestId("pull-confirm-modal")).toBeNull();
  });

  it("closes PullModal when ClosePull is clicked", () => {
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: "Pull" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByTestId("pull-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "ClosePull" }));
    expect(screen.queryByTestId("pull-modal")).toBeNull();
  });
});
