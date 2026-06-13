import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BackupModal } from "./BackupModal";
import type { ComposeStack } from "../api";
import { mockProcess } from "../test/helpers";
import { mockSpawn } from "../test/setup";

vi.mock("../api/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/files")>();
  return { ...actual, createBackupArchive: vi.fn() };
});

import { createBackupArchive } from "../api/files";
const mockCreateBackupArchive = vi.mocked(createBackupArchive);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/home/user/stacks/myapp/docker-compose.yml",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateBackupArchive.mockResolvedValue(undefined);
  // Default: ls check after a failed backup rejects (archive not created).
  mockSpawn.mockImplementation((args: string[]) => {
    if (args[0] === "ls") return mockProcess("", "No such file");
    return mockProcess("");
  });
});

describe("BackupModal", () => {
  it("renders title with stack name", () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Backup myapp/i)).toBeInTheDocument();
  });

  it("pre-fills base name with stack name", () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: /Archive name/i })).toHaveValue("myapp");
  });

  it("archive preview includes the base name and .bak.tar.gz extension", () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    const preview = screen.getByDisplayValue(/myapp.*\.bak\.tar\.gz/);
    expect(preview).toBeInTheDocument();
  });

  it("archive preview updates when base name changes", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    const nameInput = screen.getByRole("textbox", { name: /Archive name/i });
    fireEvent.change(nameInput, { target: { value: "my-backup" } });
    await waitFor(() => {
      const preview = screen.getByDisplayValue(/my-backup.*\.bak\.tar\.gz/);
      expect(preview).toBeInTheDocument();
    });
  });

  it("snapshots and subdirs checkboxes start unchecked", () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /Include snapshots/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Include subdirectories/i })).not.toBeChecked();
  });

  it("calls createBackupArchive with includeSnapshots false when unchecked", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(mockCreateBackupArchive).toHaveBeenCalledOnce());
    const [, , , options] = mockCreateBackupArchive.mock.calls[0];
    expect(options.includeSnapshots).toBe(false);
  });

  it("calls createBackupArchive with includeSubdirs false when unchecked", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(mockCreateBackupArchive).toHaveBeenCalledOnce());
    const [, , , options] = mockCreateBackupArchive.mock.calls[0];
    expect(options.includeSubdirs).toBe(false);
  });

  it("calls createBackupArchive with includeSnapshots true when checked", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Include snapshots/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(mockCreateBackupArchive).toHaveBeenCalledOnce());
    const [, , , options] = mockCreateBackupArchive.mock.calls[0];
    expect(options.includeSnapshots).toBe(true);
  });

  it("calls createBackupArchive with includeSubdirs true when checked", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Include subdirectories/i }));
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(mockCreateBackupArchive).toHaveBeenCalledOnce());
    const [, , , options] = mockCreateBackupArchive.mock.calls[0];
    expect(options.includeSubdirs).toBe(true);
  });

  it("shows success alert with saved path after backup completes", async () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(screen.getByText(/Backup created/i)).toBeInTheDocument());
    expect(screen.getByText(/\.bak\.tar\.gz/)).toBeInTheDocument();
  });

  it("shows error alert when createBackupArchive fails", async () => {
    mockCreateBackupArchive.mockRejectedValue(new Error("permission denied"));
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    expect(screen.queryByText(/Backup created/i)).toBeNull();
  });

  it("Create backup button is disabled when base name is empty", () => {
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    const nameInput = screen.getByRole("textbox", { name: /Archive name/i });
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(screen.getByRole("button", { name: /Create backup/i })).toBeDisabled();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    render(<BackupModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("calls onClose when Close clicked after success", async () => {
    const onClose = vi.fn();
    render(<BackupModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => screen.getByText(/Backup created/i));
    const closeBtns = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeBtns[closeBtns.length - 1]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows success with warning when tar fails but archive file was created", async () => {
    mockCreateBackupArchive.mockRejectedValue(new Error("permission denied: .ssh"));
    mockSpawn.mockImplementation((args: string[]) => {
      if (args[0] === "ls") return mockProcess("/path/to/archive.bak.tar.gz");
      return mockProcess("");
    });
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(screen.getByText(/Backup created/i)).toBeInTheDocument());
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert", { name: /danger/i })).not.toBeInTheDocument();
  });

  it("shows error when tar fails and archive file was not created", async () => {
    mockCreateBackupArchive.mockRejectedValue(new Error("no space left on device"));
    mockSpawn.mockImplementation((args: string[]) => {
      if (args[0] === "ls") return mockProcess("", "No such file");
      return mockProcess("");
    });
    render(<BackupModal stack={stack} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Create backup/i }));
    await waitFor(() => expect(screen.getByText(/no space left on device/i)).toBeInTheDocument());
    expect(screen.queryByText(/Backup created/i)).not.toBeInTheDocument();
  });
});
