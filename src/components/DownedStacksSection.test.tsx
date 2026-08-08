import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { DownedStacksSection, inferComposeRoot } from "./DownedStacksSection";

vi.mock("../hooks/useDownedStacksScan", () => ({
  useDownedStacksScan: vi.fn(),
}));
vi.mock("./UpConfirmModal", () => ({
  UpConfirmModal: ({ onConfirm, onClose }: { onConfirm: (profiles: string[]) => void; onClose: () => void }) => (
    <div data-testid="up-confirm-modal">
      <button onClick={() => onConfirm([])}>ConfirmUp</button>
      <button onClick={onClose}>CancelConfirm</button>
    </div>
  ),
}));
vi.mock("./UpModal", () => ({
  UpModal: ({ stack, onClose }: { stack: { Name: string }; onClose: (succeeded: boolean) => void }) => (
    <div data-testid="up-modal">
      UpModal:{stack.Name}
      <button onClick={() => onClose(true)}>Close</button>
      <button onClick={() => onClose(false)}>CloseFailed</button>
    </div>
  ),
}));
vi.mock("./YamlModal", () => ({
  YamlModal: ({ stack, onFileAdded, onFileRemoved }: { stack: { Name: string }; onFileAdded?: (p: string) => void; onFileRemoved?: (p: string) => void }) => (
    <div data-testid="yaml-modal">
      YamlModal:{stack.Name}
      <button onClick={() => onFileAdded?.("/extra.yml")}>AddFile</button>
      <button onClick={() => onFileRemoved?.("/path/compose.yml")}>RemoveFile</button>
    </div>
  ),
}));
vi.mock("./CreateStackModal", () => ({
  CreateStackModal: ({ onClose, onCreated }: { onClose: () => void; onCreated: (s: { name: string; configFiles: string[] }) => void }) => (
    <div data-testid="create-modal">
      <button onClick={onClose}>CloseCreate</button>
      <button onClick={() => { onCreated({ name: "new-stack", configFiles: ["/etc/compose/new-stack/docker-compose.yml"] }); onClose(); }}>SimulateCreate</button>
    </div>
  ),
}));
vi.mock("./DeleteStackModal", () => ({
  DeleteStackModal: ({ stack, onDeleted, onClose }: { stack: { name: string }; onDeleted: () => void; onClose: () => void }) => (
    <div data-testid="delete-modal">
      DeleteModal:{stack.name}
      <button onClick={onDeleted}>ConfirmDelete</button>
      <button onClick={onClose}>CloseDelete</button>
    </div>
  ),
}));
vi.mock("./BackupModal", () => ({
  BackupModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="backup-modal">
      <button onClick={onClose}>CloseBackup</button>
    </div>
  ),
}));
vi.mock("./PruneModal", () => ({
  PruneModal: ({ stack, onClose }: { stack: { Name: string }; onClose: () => void }) => (
    <div data-testid="prune-modal">
      PruneModal:{stack.Name}
      <button onClick={onClose}>ClosePrune</button>
    </div>
  ),
}));
vi.mock("./RestoreModal", () => ({
  RestoreModal: ({ onClose, onRestored, defaultScanDir }: { onClose: () => void; onRestored: (d: { name: string; configFiles: string[] }) => void; defaultScanDir?: string }) => (
    <div data-testid="restore-modal" data-scandir={defaultScanDir}>
      <button onClick={onClose}>CloseRestore</button>
      <button onClick={() => onRestored({ name: "restored-stack", configFiles: ["/etc/compose/restored-stack/docker-compose.yml"] })}>SimulateRestore</button>
    </div>
  ),
}));
vi.mock("./GlobalPruneModal", () => ({
  GlobalPruneModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="global-prune-modal">
      <button onClick={onClose}>ClosePruneImages</button>
    </div>
  ),
}));
vi.mock("./BulkActionConfirmModal", () => ({
  BulkActionConfirmModal: ({
    stacks, action, onConfirm, onClose,
  }: {
    stacks: { Name: string }[]; action: string; onConfirm: () => void; onClose: () => void;
  }) => (
    <div data-testid="bulk-confirm-modal">
      <span>{action} {stacks.map(s => s.Name).join(",")}</span>
      <button onClick={onConfirm}>Confirm</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  ),
}));

const mockEnqueue = vi.fn();
vi.mock("../hooks/useBackgroundTasks", () => ({
  useBackgroundTasks: () => ({ tasks: [], enqueue: mockEnqueue, stop: vi.fn(), remove: vi.fn(), clearPending: vi.fn() }),
}));

import { useDownedStacksScan } from "../hooks/useDownedStacksScan";
const mockUseScan = vi.mocked(useDownedStacksScan);

const noop = vi.fn();
const noopScan = vi.fn();
const noopClear = vi.fn();
const noopRemove = vi.fn();
const noopAdd = vi.fn();
const noopUpdate = vi.fn();

function defaultScanResult(overrides = {}) {
  return {
    downedStacks: [],
    scanning: false,
    hasScanned: false,
    error: null,
    warning: null,
    scan: noopScan,
    clear: noopClear,
    removeStack: noopRemove,
    addStack: noopAdd,
    updateStack: noopUpdate,
    ...overrides,
  };
}

beforeEach(() => {
  noop.mockReset();
  noopScan.mockReset();
  noopClear.mockReset();
  noopRemove.mockReset();
  noopAdd.mockReset();
  noopUpdate.mockReset();
  mockEnqueue.mockReset();
  mockUseScan.mockReturnValue(defaultScanResult());
});

const defaultProps = {
  stacks: [],
  manuallyDownedStacks: [],
  onRefresh: noop,
  onUpComplete: noop,
};

/** Helper: expand the import panel */
function expandImport() {
  fireEvent.click(screen.getByRole("button", { name: /Import/i }));
}

describe("inferComposeRoot", () => {
  it("returns empty string for empty stacks", () => {
    expect(inferComposeRoot([])).toBe("");
  });

  it("returns the common parent of all stack config files", () => {
    const stacks = [
      { Name: "a", Status: "", ConfigFiles: "/etc/docker/compose/a/docker-compose.yml" },
      { Name: "b", Status: "", ConfigFiles: "/etc/docker/compose/b/compose.yml" },
    ];
    expect(inferComposeRoot(stacks)).toBe("/etc/docker/compose");
  });

  it("returns most common parent when stacks differ", () => {
    const stacks = [
      { Name: "a", Status: "", ConfigFiles: "/etc/compose/a/docker-compose.yml" },
      { Name: "b", Status: "", ConfigFiles: "/etc/compose/b/compose.yml" },
      { Name: "c", Status: "", ConfigFiles: "/home/user/stacks/c/compose.yml" },
    ];
    expect(inferComposeRoot(stacks)).toBe("/etc/compose");
  });
});

describe("DownedStacksSection — Create button", () => {
  it("renders Create button", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: /^Create$/i })).toBeInTheDocument();
  });

  it("Create button opens CreateStackModal", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    expect(screen.getByTestId("create-modal")).toBeInTheDocument();
  });

  it("after create, modal closes and YamlModal is not auto-opened", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ addStack: noopAdd }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    fireEvent.click(screen.getByRole("button", { name: /SimulateCreate/i }));
    expect(screen.queryByTestId("create-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("yaml-modal")).not.toBeInTheDocument();
  });
});

describe("DownedStacksSection — Import toggle", () => {
  it("renders Import button by default", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Import/i })).toBeInTheDocument();
  });

  it("controls are hidden before Import is clicked", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByPlaceholderText(/Type compose root/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Scan$/i })).not.toBeInTheDocument();
  });

  it("controls are visible after Import is clicked", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expandImport();
    expect(screen.getByPlaceholderText(/Type compose root/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Scan$/i })).toBeInTheDocument();
  });

  it("clicking Import again collapses the controls", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expandImport();
    expect(screen.getByPlaceholderText(/Type compose root/i)).toBeInTheDocument();
    expandImport(); // collapse
    expect(screen.queryByPlaceholderText(/Type compose root/i)).not.toBeInTheDocument();
  });
});

describe("DownedStacksSection — controls", () => {
  it("Scan button is disabled when input is empty", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expandImport();
    expect(screen.getByRole("button", { name: /^Scan$/i })).toBeDisabled();
  });

  it("Scan button is enabled after typing a path", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expandImport();
    fireEvent.change(screen.getByPlaceholderText(/Type compose root/i), {
      target: { value: "/etc/docker/compose" },
    });
    expect(screen.getByRole("button", { name: /^Scan$/i })).not.toBeDisabled();
  });

  it("clicking Scan calls scan()", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expandImport();
    fireEvent.change(screen.getByPlaceholderText(/Type compose root/i), {
      target: { value: "/etc/docker/compose" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Scan$/i }));
    expect(noopScan).toHaveBeenCalledOnce();
  });

  it("Find best match is disabled when no active stacks", () => {
    render(<DownedStacksSection {...defaultProps} stacks={[]} />);
    expandImport();
    expect(screen.getByRole("button", { name: /Find best match/i })).toBeDisabled();
  });

  it("Find best match prefills input with inferred root", () => {
    const stacks = [
      { Name: "a", Status: "", ConfigFiles: "/etc/docker/compose/a/docker-compose.yml" },
      { Name: "b", Status: "", ConfigFiles: "/etc/docker/compose/b/compose.yml" },
    ];
    render(<DownedStacksSection {...defaultProps} stacks={stacks} />);
    expandImport();
    fireEvent.click(screen.getByRole("button", { name: /Find best match/i }));
    const input = screen.getByPlaceholderText(/Type compose root/i) as HTMLInputElement;
    expect(input.value).toBe("/etc/docker/compose");
  });

  it("typing in input does not clear existing scan results", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    // results visible even before opening import
    expect(screen.getByText("myapp")).toBeInTheDocument();
    expandImport();
    // typing does not clear
    fireEvent.change(screen.getByPlaceholderText(/Type compose root/i), {
      target: { value: "/other/path" },
    });
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });
});

describe("DownedStacksSection — Down section content", () => {
  it("renders nothing in the Down section when no content", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByText(/^Down$/i)).not.toBeInTheDocument();
  });

  it("shows Down separator when scanning", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ scanning: true }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByText(/^Down$/i)).toBeInTheDocument();
  });

  it("shows warning when scan finds nothing (hasScanned=true)", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByText(/Nothing found/i)).toBeInTheDocument();
    expect(screen.getByText(/Are you sure this is a compose parent directory/i)).toBeInTheDocument();
  });

  it("does not show empty warning when hasScanned=false", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByText(/Nothing found/i)).not.toBeInTheDocument();
  });

  it("shows error when scan fails", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ error: "No such file or directory" }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByText(/Scan failed/i)).toBeInTheDocument();
    expect(screen.getByText(/No such file or directory/i)).toBeInTheDocument();
  });

  it("renders scanned downed stack rows", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [
        { name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] },
      ],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
    expect(screen.getByText("/etc/docker/compose/myapp")).toBeInTheDocument();
  });

  it("renders manually downed stacks even without a scan", () => {
    const manuallyDownedStacks = [{ name: "manual-app", configFiles: ["/tmp/manual-app/compose.yml"] }];
    render(<DownedStacksSection {...defaultProps} manuallyDownedStacks={manuallyDownedStacks} />);
    expect(screen.getByText("manual-app")).toBeInTheDocument();
  });

  it("deduplicates manually downed and scanned stacks", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    const manuallyDownedStacks = [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }];
    render(<DownedStacksSection {...defaultProps} manuallyDownedStacks={manuallyDownedStacks} />);
    expect(screen.getAllByText("myapp")).toHaveLength(1);
  });

  it("↑ Up button opens UpConfirmModal then UpModal after confirm", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /ConfirmUp/i }));
    expect(screen.getByTestId("up-modal")).toBeInTheDocument();
    expect(screen.getByText("UpModal:myapp")).toBeInTheDocument();
  });

  it("UpModal close (success) calls onUpComplete, onRefresh, removeStack", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onRefresh = vi.fn();
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onRefresh={onRefresh} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    fireEvent.click(screen.getByRole("button", { name: /ConfirmUp/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(onUpComplete).toHaveBeenCalledWith("myapp");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(noopRemove).toHaveBeenCalledWith("myapp");
  });

  it("UpModal close (failure) keeps stack in table and does not call onUpComplete", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onRefresh = vi.fn();
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onRefresh={onRefresh} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    fireEvent.click(screen.getByRole("button", { name: /ConfirmUp/i }));
    fireEvent.click(screen.getByRole("button", { name: /CloseFailed/i }));
    expect(onUpComplete).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(noopRemove).not.toHaveBeenCalled();
    expect(screen.queryByTestId("up-modal")).not.toBeInTheDocument();
  });

  it("Delete button opens DeleteStackModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete compose file/i }));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
    expect(screen.getByText("DeleteModal:myapp")).toBeInTheDocument();
  });

  it("Delete confirm calls removeStack and onUpComplete", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /delete compose file/i }));
    fireEvent.click(screen.getByRole("button", { name: /ConfirmDelete/i }));
    expect(noopRemove).toHaveBeenCalledWith("myapp");
    expect(onUpComplete).toHaveBeenCalledWith("myapp");
    expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
  });

  it("Edit button opens YamlModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("does not render an Info button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /Info/i })).not.toBeInTheDocument();
  });

  it("shows abbreviated file names when there are multiple configFiles", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{
        name: "myapp",
        configFiles: [
          "/etc/docker/compose/myapp/docker-compose.yml",
          "/etc/docker/compose/myapp/docker-compose.override.yml",
        ],
      }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    // Second line shows combined filenames
    expect(screen.getByText(/docker-compose\.yml \+ docker-compose\.override\.yml/)).toBeInTheDocument();
  });

  it("CancelConfirm on UpConfirmModal closes it without opening UpModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CancelConfirm" }));
    expect(screen.queryByTestId("up-confirm-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("up-modal")).not.toBeInTheDocument();
  });

  it("YamlModal onFileAdded adds path to configFiles", () => {
    const updateStack = vi.fn();
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
      updateStack,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "AddFile" }));
    expect(updateStack).toHaveBeenCalled();
  });

  it("YamlModal onFileRemoved removes path from configFiles", () => {
    const updateStack = vi.fn();
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/compose/myapp/docker-compose.yml", "/etc/compose/myapp/override.yml"] }],
      hasScanned: true,
      updateStack,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: "RemoveFile" }));
    expect(updateStack).toHaveBeenCalled();
  });

  it("CloseDelete closes the delete modal without removing stack", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /delete compose file/i }));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CloseDelete" }));
    expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
  });

  it("Backup button opens BackupModal for that stack", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /backup/i }));
    expect(screen.getByTestId("backup-modal")).toBeInTheDocument();
  });

  it("CloseBackup closes the BackupModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /backup/i }));
    fireEvent.click(screen.getByRole("button", { name: "CloseBackup" }));
    expect(screen.queryByTestId("backup-modal")).not.toBeInTheDocument();
  });

  it("Prune button opens PruneModal for that stack", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Prune" }));
    expect(screen.getByTestId("prune-modal")).toBeInTheDocument();
    expect(screen.getByTestId("prune-modal")).toHaveTextContent("PruneModal:myapp");
  });

  it("ClosePrune closes the PruneModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Prune" }));
    fireEvent.click(screen.getByRole("button", { name: "ClosePrune" }));
    expect(screen.queryByTestId("prune-modal")).not.toBeInTheDocument();
  });
});

describe("DownedStacksSection — RestoreModal", () => {
  it("Restore button opens RestoreModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(screen.getByTestId("restore-modal")).toBeInTheDocument();
  });

  it("CloseRestore closes the RestoreModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    fireEvent.click(screen.getByRole("button", { name: "CloseRestore" }));
    expect(screen.queryByTestId("restore-modal")).not.toBeInTheDocument();
  });

  it("SimulateRestore calls addStack and closes modal", () => {
    const addStack = vi.fn();
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true, addStack }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    fireEvent.click(screen.getByRole("button", { name: "SimulateRestore" }));
    expect(addStack).toHaveBeenCalledWith(expect.objectContaining({ name: "restored-stack" }));
    expect(screen.queryByTestId("restore-modal")).not.toBeInTheDocument();
  });

  it("passes downed-stack directory as defaultScanDir when stacks=[]", () => {
    const manuallyDownedStacks = [{ name: "myapp", configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"] }];
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} stacks={[]} manuallyDownedStacks={manuallyDownedStacks} />);
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    expect(screen.getByTestId("restore-modal")).toHaveAttribute("data-scandir", "/etc/docker/compose");
  });
});

describe("DownedStacksSection — bulk select-all and bulk Up", () => {
  const stackA = { name: "alpha", configFiles: ["/etc/compose/alpha/compose.yml"] };
  const stackB = { name: "beta", configFiles: ["/etc/compose/beta/compose.yml"] };

  beforeEach(() => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [stackA, stackB], hasScanned: true }));
  });

  it("does not show the bulk bar when nothing is selected", () => {
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByTestId("dss-bulk-bar")).not.toBeInTheDocument();
  });

  it("shows the bulk bar once a stack is selected", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    expect(screen.getByTestId("dss-bulk-bar")).toBeInTheDocument();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });

  it("select-all selects every downed stack", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(screen.getByTestId("dss-select-all"));
    expect(screen.getByText(/2 selected/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Select alpha")).toBeChecked();
    expect(screen.getByLabelText("Select beta")).toBeChecked();
  });

  it("de-toggling select-all clears the selection but keeps the bar visible with the Up button disabled", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(screen.getByTestId("dss-select-all"));
    fireEvent.click(screen.getByTestId("dss-select-all"));

    expect(screen.getByTestId("dss-bulk-bar")).toBeInTheDocument();
    expect(screen.getByText(/0 selected/i)).toBeInTheDocument();
    expect(within(screen.getByTestId("dss-bulk-bar")).getByRole("button", { name: "Up" })).toBeDisabled();
  });

  it("clear selection button fully hides the bulk bar", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(screen.getByRole("button", { name: /clear selection/i }));
    expect(screen.queryByTestId("dss-bulk-bar")).not.toBeInTheDocument();
  });

  it("bulk Up opens the confirm modal, and confirming enqueues an up task per selected stack", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(screen.getByLabelText("Select beta"));
    fireEvent.click(within(screen.getByTestId("dss-bulk-bar")).getByRole("button", { name: "Up" }));

    expect(screen.getByTestId("bulk-confirm-modal")).toBeInTheDocument();
    expect(screen.getByText("up alpha,beta")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(mockEnqueue).toHaveBeenCalledTimes(2);
    expect(mockEnqueue.mock.calls[0][0]).toBe("alpha");
    expect(mockEnqueue.mock.calls[0][1]).toBe("up");
    expect(mockEnqueue.mock.calls[1][0]).toBe("beta");
    expect(screen.queryByTestId("bulk-confirm-modal")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dss-bulk-bar")).not.toBeInTheDocument();
  });

  it("calls removeStack/onUpComplete/onRefresh via the enqueued onSuccess callback once a bulk up task succeeds", () => {
    const removeStack = vi.fn();
    const onUpComplete = vi.fn();
    const onRefresh = vi.fn();
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [stackA, stackB], hasScanned: true, removeStack }));
    render(<DownedStacksSection {...defaultProps} onUpComplete={onUpComplete} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(within(screen.getByTestId("dss-bulk-bar")).getByRole("button", { name: "Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    const onSuccess = mockEnqueue.mock.calls[0][4] as () => void;
    onSuccess();
    expect(removeStack).toHaveBeenCalledWith("alpha");
    expect(onUpComplete).toHaveBeenCalledWith("alpha");
    expect(onRefresh).toHaveBeenCalled();
  });

  it("cancelling the bulk confirm modal keeps the selection intact", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByLabelText("Select alpha"));
    fireEvent.click(within(screen.getByTestId("dss-bulk-bar")).getByRole("button", { name: "Up" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("bulk-confirm-modal")).not.toBeInTheDocument();
    expect(mockEnqueue).not.toHaveBeenCalled();
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });

  it("clicking a default-layout row (not a button) toggles its selection", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByText("alpha"));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Select alpha")).toBeChecked();
  });

  it("clicking a button within a default-layout row does not toggle its selection", () => {
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Up$/i })[0]);
    expect(screen.queryByTestId("dss-bulk-bar")).not.toBeInTheDocument();
  });

  it("clicking a pretty-layout card (not a button) toggles its selection", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [stackA, stackB], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    fireEvent.click(screen.getByText("alpha"));
    expect(screen.getByText(/1 selected/i)).toBeInTheDocument();
  });

  it("clicking the Up button within a pretty-layout card does not toggle its selection", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [stackA, stackB], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    fireEvent.click(screen.getAllByRole("button", { name: /up/i })[0]);
    expect(screen.queryByTestId("dss-bulk-bar")).not.toBeInTheDocument();
  });
});

describe("DownedStacksSection — GlobalPruneModal", () => {
  it("Prune images button opens GlobalPruneModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /prune images/i }));
    expect(screen.getByTestId("global-prune-modal")).toBeInTheDocument();
  });

  it("ClosePruneImages closes the GlobalPruneModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /prune images/i }));
    fireEvent.click(screen.getByRole("button", { name: "ClosePruneImages" }));
    expect(screen.queryByTestId("global-prune-modal")).not.toBeInTheDocument();
  });

  it("shows the Prune images button in minimal layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="minimal" />);
    fireEvent.click(screen.getByRole("button", { name: /prune images/i }));
    expect(screen.getByTestId("global-prune-modal")).toBeInTheDocument();
  });

  it("shows the [prune images] button in unix layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="unix" />);
    fireEvent.click(screen.getByText("[prune images]"));
    expect(screen.getByTestId("global-prune-modal")).toBeInTheDocument();
  });

  it("shows the Prune images button in pretty layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    fireEvent.click(screen.getByRole("button", { name: /prune images/i }));
    expect(screen.getByTestId("global-prune-modal")).toBeInTheDocument();
  });
});

describe("DownedStacksSection — layout variants", () => {
  const downedStack = { name: "my-app", configFiles: ["/etc/compose/my-app/compose.yml"] };

  it("renders stacks in minimal layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="minimal" />);
    expect(screen.getByText("my-app")).toBeInTheDocument();
  });

  it("triggers up confirm modal from minimal layout card click", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="minimal" />);
    fireEvent.click(screen.getByRole("button", { name: /start stack/i }));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
  });

  it("renders stacks in pretty layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    expect(screen.getByText("my-app")).toBeInTheDocument();
  });

  it("triggers up confirm modal from pretty layout up button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    const upBtn = document.querySelector(".dss-pretty-up") as HTMLElement;
    expect(upBtn).toBeTruthy();
    fireEvent.click(upBtn);
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
  });

  it("opens yaml modal from pretty layout edit button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    fireEvent.click(screen.getByRole("button", { name: /edit compose/i }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("opens delete modal from pretty layout delete button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="pretty" />);
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
  });

  it("renders stacks in unix layout", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="unix" />);
    expect(screen.getByText("my-app")).toBeInTheDocument();
  });

  it("triggers up confirm modal from unix layout [up] button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="unix" />);
    fireEvent.click(screen.getByText("[up]"));
    expect(screen.getByTestId("up-confirm-modal")).toBeInTheDocument();
  });

  it("opens yaml modal from unix layout [ed] button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="unix" />);
    fireEvent.click(screen.getByText("[ed]"));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("opens delete modal from unix layout [del] button", () => {
    mockUseScan.mockReturnValue(defaultScanResult({ downedStacks: [downedStack], hasScanned: true }));
    render(<DownedStacksSection {...defaultProps} layout="unix" />);
    fireEvent.click(screen.getByText("[del]"));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
  });
});
