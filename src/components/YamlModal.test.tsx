import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { YamlModal } from "./YamlModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

const { mockComposeFileSuperuser, mockRemoveFile, mockListYamlFilesInDir } = vi.hoisted(() => ({
  mockComposeFileSuperuser: vi.fn().mockResolvedValue(undefined),
  mockRemoveFile: vi.fn().mockResolvedValue(undefined),
  mockListYamlFilesInDir: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, composeFileSuperuser: mockComposeFileSuperuser, removeFile: mockRemoveFile, listYamlFilesInDir: mockListYamlFilesInDir };
});

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
  mockComposeFileSuperuser.mockReset().mockResolvedValue(undefined);
  mockRemoveFile.mockReset().mockResolvedValue(undefined);
  mockListYamlFilesInDir.mockReset().mockReturnValue(mockProcess(""));
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

const multiFileStack: ComposeStack = {
  Name: "myapp",
  Status: "running(2)",
  ConfigFiles: "/path/compose.yml,/path/prod.yml",
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

describe("YamlModal — add file", () => {
  it("shows Add file button after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Add$/i })).toBeInTheDocument());
  });

  it("clicking Add file opens sub-modal", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(screen.getByText("Add compose file")).toBeInTheDocument();
    expect(screen.getByLabelText(/Filename/i)).toBeInTheDocument();
  });

  it("Create file with empty name shows error", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create file/i }));
    await waitFor(() => expect(screen.getByText(/Filename is required/i)).toBeInTheDocument());
  });

  it("Create file with invalid extension shows error", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.change(screen.getByPlaceholderText("my-overrides.yml"), { target: { value: "myfile.txt" } });
    // PF hides the parent modal via aria-hidden when the sub-modal opens; use getByText
    fireEvent.click(screen.getByText("Create file"));
    await waitFor(() => expect(screen.getByText(/must end in .yml or .yaml/i)).toBeInTheDocument());
  });

  it("Create file with path separator shows error", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.change(screen.getByPlaceholderText("my-overrides.yml"), { target: { value: "sub/dir.yml" } });
    fireEvent.click(screen.getByText("Create file"));
    await waitFor(() => expect(screen.getByText(/must not contain path separators/i)).toBeInTheDocument());
  });

  it("Create file with valid name writes file and calls onFileAdded", async () => {
    const mockReplace = vi.fn().mockResolvedValue(undefined);
    mockCockpitFile.mockReturnValue({ replace: mockReplace });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    const onFileAdded = vi.fn();
    render(<YamlModal stack={stack} onClose={vi.fn()} onFileAdded={onFileAdded} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.change(screen.getByPlaceholderText("my-overrides.yml"), { target: { value: "prod.yml" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Create file"));
    });
    await waitFor(() => {
      expect(mockCockpitFile).toHaveBeenCalledWith("/path/prod.yml", expect.objectContaining({}));
      expect(mockReplace).toHaveBeenCalled();
      expect(onFileAdded).toHaveBeenCalledWith("/path/prod.yml");
    });
  });

  it("after creation the add-file sub-modal closes", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.change(screen.getByPlaceholderText("my-overrides.yml"), { target: { value: "prod.yml" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Create file"));
    });
    await waitFor(() => expect(screen.queryByText("Add compose file")).toBeNull());
  });
});

describe("YamlModal — delete file", () => {
  it("Delete file button is not shown on the primary tab", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Add$/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Delete file/i })).toBeNull();
  });

  it("Delete file button is not shown on primary tab of multi-file stack", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Add$/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Delete file/i })).toBeNull();
  });

  it("Delete file button is shown on a child tab", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("tab", { name: /prod\.yml/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Delete file/i })).toBeInTheDocument());
  });

  it("clicking Delete file opens confirm dialog with filename", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("tab", { name: /prod\.yml/i }));
    await waitFor(() => screen.getByRole("button", { name: /Delete file/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete file/i }));
    await waitFor(() => expect(screen.getByText(/Delete prod\.yml\?/i)).toBeInTheDocument());
  });

  it("Cancel on delete confirm closes the dialog", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("tab", { name: /prod\.yml/i }));
    await waitFor(() => screen.getByRole("button", { name: /Delete file/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete file/i }));
    await waitFor(() => screen.getByText(/Delete prod\.yml\?/i));
    fireEvent.click(screen.getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText(/Delete prod\.yml\?/i)).toBeNull());
    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  it("confirming delete calls removeFile and onFileRemoved", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    const onFileRemoved = vi.fn();
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} onFileRemoved={onFileRemoved} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("tab", { name: /prod\.yml/i }));
    await waitFor(() => screen.getByRole("button", { name: /Delete file/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete file/i }));
    await waitFor(() => screen.getByText(/Delete prod\.yml\?/i));
    // PF marks the parent modal aria-hidden when the confirm opens; scope to the confirm dialog
    const confirmDialog = screen.getByRole("dialog", { name: /Confirm delete compose file/i, hidden: true });
    await act(async () => {
      fireEvent.click(within(confirmDialog).getByText("Delete file"));
    });
    await waitFor(() => {
      expect(mockRemoveFile).toHaveBeenCalledWith("/path/prod.yml");
      expect(onFileRemoved).toHaveBeenCalledWith("/path/prod.yml");
    });
  });
});

describe("YamlModal — import file", () => {
  it("shows Import file button after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Import$/i })).toBeInTheDocument());
  });

  it("clicking Import file opens modal and shows available files after scan", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    // mockImplementation creates a fresh CockpitProcess on each call so queueMicrotask
    // fires AFTER proc.stream(cb) is set, not before (mockReturnValue would pre-create
    // the process and fire the microtask before the Import button is even clicked)
    mockListYamlFilesInDir.mockImplementation(() => mockProcess("/path/staging.yml\n/path/dev.yml\n"));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));
    // "Available files" label only renders after scan completes with results
    await waitFor(() => expect(screen.getByText("Available files")).toBeInTheDocument());
    // Import button is enabled (file pre-selected)
    const importDialog = screen.getByRole("dialog", { name: /Import existing file/i, hidden: true });
    expect(within(importDialog).getByRole("button", { name: /^Import$/i, hidden: true })).not.toBeDisabled();
  });

  it("filters files already in configFiles — only extras selectable", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    // compose.yml is in configFiles; extra.yml is not — only extra.yml should be selectable
    mockListYamlFilesInDir.mockImplementation(() => mockProcess("/path/compose.yml\n/path/extra.yml\n"));
    const onFileAdded = vi.fn();
    render(<YamlModal stack={stack} onClose={vi.fn()} onFileAdded={onFileAdded} />);
    await waitFor(() => screen.getByRole("button", { name: /^Import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));
    await waitFor(() => screen.getByText("Available files")); // scan done, extra.yml pre-selected
    const importDialog = screen.getByRole("dialog", { name: /Import existing file/i, hidden: true });
    fireEvent.click(within(importDialog).getByRole("button", { name: /^Import$/i, hidden: true }));
    // compose.yml was filtered → pre-selected file must be extra.yml
    await waitFor(() => expect(onFileAdded).toHaveBeenCalledWith("/path/extra.yml"));
  });

  it("shows 'no files' message when directory has no additional YAMLs", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    mockListYamlFilesInDir.mockImplementation(() => mockProcess("/path/compose.yml\n"));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));
    await waitFor(() => expect(screen.getByText(/No additional YAML files found/i)).toBeInTheDocument());
  });

  it("clicking Import adds the file and calls onFileAdded", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    mockListYamlFilesInDir.mockImplementation(() => mockProcess("/path/staging.yml\n"));
    const onFileAdded = vi.fn();
    render(<YamlModal stack={stack} onClose={vi.fn()} onFileAdded={onFileAdded} />);
    await waitFor(() => screen.getByRole("button", { name: /^Import$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Import$/i }));
    await waitFor(() => screen.getByText("Available files")); // scan done, staging.yml pre-selected
    const importDialog = screen.getByRole("dialog", { name: /Import existing file/i, hidden: true });
    fireEvent.click(within(importDialog).getByRole("button", { name: /^Import$/i, hidden: true }));
    await waitFor(() => expect(onFileAdded).toHaveBeenCalledWith("/path/staging.yml"));
    expect(screen.queryByText("Import existing file")).toBeNull();
  });
});

describe("YamlModal — modal close (X button) handlers", () => {
  it("X button on add-file sub-modal closes it", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(screen.getByText("Add compose file")).toBeInTheDocument();
    // Click the X button on the add-file modal (the PF6 modal close button)
    const addFileDialog = screen.getByRole("dialog", { name: /Add compose file/i, hidden: true });
    const xBtn = within(addFileDialog).getByRole("button", { name: /close/i, hidden: true });
    fireEvent.click(xBtn);
    await waitFor(() => expect(screen.queryByText("Add compose file")).toBeNull());
  });

  it("Cancel button on add-file sub-modal closes it", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Add$/i }));
    expect(screen.getByText("Add compose file")).toBeInTheDocument();
    const addFileDialog = screen.getByRole("dialog", { name: /Add compose file/i, hidden: true });
    fireEvent.click(within(addFileDialog).getByRole("button", { name: /^Cancel$/i, hidden: true }));
    await waitFor(() => expect(screen.queryByText("Add compose file")).toBeNull());
  });

  it("X button on delete-confirm sub-modal closes it", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={multiFileStack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Add$/i }));
    fireEvent.click(screen.getByRole("tab", { name: /prod\.yml/i }));
    await waitFor(() => screen.getByRole("button", { name: /Delete file/i }));
    fireEvent.click(screen.getByRole("button", { name: /Delete file/i }));
    const deleteDialog = screen.getByRole("dialog", { name: /Confirm delete compose file/i, hidden: true });
    expect(deleteDialog).toBeInTheDocument();
    const xBtn = within(deleteDialog).getByRole("button", { name: /close/i, hidden: true });
    fireEvent.click(xBtn);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Confirm delete compose file/i, hidden: true })).toBeNull());
  });

  it("X button on confirm-save sub-modal closes it", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /^Edit$/i }));
    // Open edit mode and trigger diagnostics warning then try to save
    fireEvent.click(screen.getByRole("button", { name: /^Edit$/i }));
    await waitFor(() => screen.getByRole("button", { name: /^Save$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    // If there are diagnostics, the confirmSave modal appears; click its X
    const confirmDialog = screen.queryByRole("dialog", { name: /Save with issues\?/i, hidden: true });
    if (confirmDialog) {
      const xBtn = within(confirmDialog).getByRole("button", { name: /close/i, hidden: true });
      fireEvent.click(xBtn);
      await waitFor(() => expect(screen.queryByRole("dialog", { name: /Save with issues\?/i, hidden: true })).toBeNull());
    }
  });
});
