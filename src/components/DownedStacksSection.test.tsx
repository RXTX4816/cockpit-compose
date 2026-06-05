import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DownedStacksSection, inferComposeRoot } from "./DownedStacksSection";

vi.mock("../hooks/useDownedStacksScan", () => ({
  useDownedStacksScan: vi.fn(),
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
  YamlModal: ({ stack }: { stack: { Name: string } }) => (
    <div data-testid="yaml-modal">YamlModal:{stack.Name}</div>
  ),
}));
vi.mock("./CreateStackModal", () => ({
  CreateStackModal: ({ onClose, onCreated }: { onClose: () => void; onCreated: (s: { name: string; configFile: string }) => void }) => (
    <div data-testid="create-modal">
      <button onClick={onClose}>CloseCreate</button>
      <button onClick={() => { onCreated({ name: "new-stack", configFile: "/etc/compose/new-stack/docker-compose.yml" }); onClose(); }}>SimulateCreate</button>
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

import { useDownedStacksScan } from "../hooks/useDownedStacksScan";
const mockUseScan = vi.mocked(useDownedStacksScan);

const noop = vi.fn();
const noopScan = vi.fn();
const noopClear = vi.fn();
const noopRemove = vi.fn();
const noopAdd = vi.fn();

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
    ...overrides,
  };
}

beforeEach(() => {
  noop.mockReset();
  noopScan.mockReset();
  noopClear.mockReset();
  noopRemove.mockReset();
  noopAdd.mockReset();
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
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
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
        { name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" },
      ],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
    expect(screen.getByText("/etc/docker/compose/myapp/docker-compose.yml")).toBeInTheDocument();
  });

  it("renders manually downed stacks even without a scan", () => {
    const manuallyDownedStacks = [{ name: "manual-app", configFile: "/tmp/manual-app/compose.yml" }];
    render(<DownedStacksSection {...defaultProps} manuallyDownedStacks={manuallyDownedStacks} />);
    expect(screen.getByText("manual-app")).toBeInTheDocument();
  });

  it("deduplicates manually downed and scanned stacks", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
    }));
    const manuallyDownedStacks = [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }];
    render(<DownedStacksSection {...defaultProps} manuallyDownedStacks={manuallyDownedStacks} />);
    expect(screen.getAllByText("myapp")).toHaveLength(1);
  });

  it("↑ Up button opens UpModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /↑ Up/i }));
    expect(screen.getByTestId("up-modal")).toBeInTheDocument();
    expect(screen.getByText("UpModal:myapp")).toBeInTheDocument();
  });

  it("UpModal close (success) calls onUpComplete, onRefresh, removeStack", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onRefresh = vi.fn();
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onRefresh={onRefresh} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /↑ Up/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Close$/ }));
    expect(onUpComplete).toHaveBeenCalledWith("myapp");
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(noopRemove).toHaveBeenCalledWith("myapp");
  });

  it("UpModal close (failure) keeps stack in table and does not call onUpComplete", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onRefresh = vi.fn();
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onRefresh={onRefresh} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /↑ Up/i }));
    fireEvent.click(screen.getByRole("button", { name: /CloseFailed/i }));
    expect(onUpComplete).not.toHaveBeenCalled();
    expect(onRefresh).not.toHaveBeenCalled();
    expect(noopRemove).not.toHaveBeenCalled();
    // modal is gone but stack row is still visible (mock removeStack was not called)
    expect(screen.queryByTestId("up-modal")).not.toBeInTheDocument();
  });

  it("Delete button opens DeleteStackModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /✕ Delete/i }));
    expect(screen.getByTestId("delete-modal")).toBeInTheDocument();
    expect(screen.getByText("DeleteModal:myapp")).toBeInTheDocument();
  });

  it("Delete confirm calls removeStack and onUpComplete", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
      removeStack: noopRemove,
    }));
    const onUpComplete = vi.fn();
    render(<DownedStacksSection {...defaultProps} onUpComplete={onUpComplete} />);
    fireEvent.click(screen.getByRole("button", { name: /✕ Delete/i }));
    fireEvent.click(screen.getByRole("button", { name: /ConfirmDelete/i }));
    expect(noopRemove).toHaveBeenCalledWith("myapp");
    expect(onUpComplete).toHaveBeenCalledWith("myapp");
    expect(screen.queryByTestId("delete-modal")).not.toBeInTheDocument();
  });

  it("Edit button opens YamlModal", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("does not render Info or Prune buttons", () => {
    mockUseScan.mockReturnValue(defaultScanResult({
      downedStacks: [{ name: "myapp", configFile: "/etc/docker/compose/myapp/docker-compose.yml" }],
      hasScanned: true,
    }));
    render(<DownedStacksSection {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /Info/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prune/i })).not.toBeInTheDocument();
  });
});
