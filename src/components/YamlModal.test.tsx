import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { YamlModal } from "./YamlModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

vi.mock("./YamlEditor", () => ({
  YamlEditor: ({ content, onChange, readOnly }: { content: string; onChange?: (v: string) => void; readOnly?: boolean }) => (
    <textarea value={content} data-testid="yaml-editor" readOnly={readOnly} onChange={e => onChange?.(e.target.value)} />
  ),
}));

vi.mock("./EnvModal", () => ({
  EnvModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="env-modal">
      <button onClick={onClose}>CloseEnv</button>
    </div>
  ),
}));

vi.mock("../hooks/useSnapshots", () => ({
  useSnapshots: vi.fn(),
}));

const mockCockpitFile = vi.fn();
beforeEach(() => {
  mockSpawn.mockReset();
  mockCockpitFile.mockReset().mockReturnValue({ replace: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal("cockpit", { spawn: mockSpawn, file: mockCockpitFile });
});

import { useSnapshots } from "../hooks/useSnapshots";
const mockUseSnapshots = vi.mocked(useSnapshots);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

const composeContent = "services:\n  web:\n    image: nginx\n";

beforeEach(() => {
  mockUseSnapshots.mockReturnValue({
    snapshots: [],
    load: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn(),
    remove: vi.fn(),
  });
});

describe("YamlModal", () => {
  it("renders modal title with stack name", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp — compose file/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows spinner while loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await act(async () => {});
  });

  it("displays compose file content after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
  });

  it("shows config file path", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/path/compose.yml")).toBeInTheDocument());
  });

  it("shows error alert when compose file cannot be read", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "file not found"));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not read file/i)).toBeInTheDocument());
  });

  it("shows Edit button when not in edit mode", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument());
  });

  it("enters edit mode and shows Save/Cancel buttons on Edit click", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("Cancel reverts to read mode", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("button", { name: /Save/i })).toBeNull();
  });

  it("shows snapshot History button when snapshots exist", async () => {
    mockUseSnapshots.mockReturnValue({
      snapshots: [{ timestamp: 1700000000000, name: "Jan 1 2024", path: "/path/compose.yml.snapshot.1700000000000" }],
      load: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn(),
      remove: vi.fn(),
    });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /History/i })).toBeInTheDocument());
  });

  it("History button click shows and hides the snapshots panel", async () => {
    mockUseSnapshots.mockReturnValue({
      snapshots: [{ timestamp: 1700000000000, name: "Jan 1 2024", path: "/path/compose.yml.snapshot.1700000000000" }],
      load: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn(),
      remove: vi.fn(),
    });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    expect(screen.getByText("Snapshots")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    expect(screen.queryByText("Snapshots")).toBeNull();
  });

  it("Restore snapshot enters edit mode with snapshot content", async () => {
    const restoreContent = "services:\n  api:\n    image: node\n";
    const restore = vi.fn().mockResolvedValue(restoreContent);
    mockUseSnapshots.mockReturnValue({
      snapshots: [{ timestamp: 1700000000000, name: "Jan 1 2024", path: "/path/compose.yml.snapshot.1700000000000" }],
      load: vi.fn().mockResolvedValue(undefined),
      restore,
      remove: vi.fn(),
    });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByRole("button", { name: /Restore/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument());
    expect(restore).toHaveBeenCalledWith("/path/compose.yml.snapshot.1700000000000");
  });

  it("Delete snapshot calls remove", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    mockUseSnapshots.mockReturnValue({
      snapshots: [{ timestamp: 1700000000000, name: "Jan 1 2024", path: "/path/compose.yml.snapshot.1700000000000" }],
      load: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn(),
      remove,
    });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByRole("button", { name: /History/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete/i }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("/path/compose.yml.snapshot.1700000000000"));
  });

  it("Lock button while editing returns to read mode without resetting content", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByRole("button", { name: /Lock/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Lock/i }));
    expect(screen.queryByRole("button", { name: /Save/i })).toBeNull();
  });

  it("Save with no changes exits editing without saving", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save/i })).toBeNull());
    expect(mockCockpitFile).not.toHaveBeenCalled();
  });

  it("Save with changes saves the file", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.change(screen.getByTestId("yaml-editor"), { target: { value: "services:\n  api:\n    image: node\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /Save/i })).toBeNull());
    expect(mockCockpitFile).toHaveBeenCalled();
  });

  it("Save with invalid YAML shows confirm modal with errors", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.change(screen.getByTestId("yaml-editor"), { target: { value: "services:\n  web:\n    image: [unclosed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => expect(screen.getByText(/Save with issues\?/i)).toBeInTheDocument());
    expect(screen.getByText(/Errors found/i)).toBeInTheDocument();
  });

  it("Confirm Save Anyway button saves despite errors", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.change(screen.getByTestId("yaml-editor"), { target: { value: "services:\n  web:\n    image: [unclosed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    // PatternFly hides the first modal via aria-hidden when the confirm dialog opens;
    // use getByText to find the button regardless of aria visibility.
    fireEvent.click(screen.getByText("Save Anyway"));
    await waitFor(() => expect(screen.queryByText(/Save with issues\?/i)).toBeNull());
    expect(mockCockpitFile).toHaveBeenCalled();
  });

  it("Confirm Save Cancel dismisses the confirm modal", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.change(screen.getByTestId("yaml-editor"), { target: { value: "services:\n  web:\n    image: [unclosed" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    // Scope to the confirm dialog to click its Cancel button specifically.
    const confirmDialog = screen.getByRole("dialog", { name: "Confirm save", hidden: true });
    fireEvent.click(within(confirmDialog).getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText(/Save with issues\?/i)).toBeNull());
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("shows Env file button after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Env file/i })).toBeInTheDocument());
  });

  it("clicking Env file button opens the env modal", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Env file/i }));
    fireEvent.click(screen.getByRole("button", { name: /Env file/i }));
    expect(screen.getByTestId("env-modal")).toBeInTheDocument();
  });
});
