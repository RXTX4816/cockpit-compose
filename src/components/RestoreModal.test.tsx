import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RestoreModal } from "./RestoreModal";
import type { ComposeStack } from "../api";
import { mockProcess } from "../test/helpers";

vi.mock("../api/files", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/files")>();
  return {
    ...actual,
    findBackupArchives: vi.fn(),
    listArchiveContents: vi.fn(),
    readFileFromArchive: vi.fn(),
    extractArchive: vi.fn(),
  };
});

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, findComposeFiles: vi.fn(), saveComposeFile: vi.fn() };
});

import { findBackupArchives, listArchiveContents, readFileFromArchive, extractArchive } from "../api/files";
import { findComposeFiles, saveComposeFile } from "../api";

const mockFindBackupArchives = vi.mocked(findBackupArchives);
const mockListArchiveContents = vi.mocked(listArchiveContents);
const mockReadFileFromArchive = vi.mocked(readFileFromArchive);
const mockExtractArchive = vi.mocked(extractArchive);
const mockFindComposeFiles = vi.mocked(findComposeFiles);
const mockSaveComposeFile = vi.mocked(saveComposeFile);

const ARCHIVE_LISTING = "myapp/\nmyapp/docker-compose.yml\nmyapp/.env\n";
const ARCHIVE_PATH = "/home/user/stacks/myapp-2026-06-12_12-00-00.bak.tar.gz";

const existingStacks: ComposeStack[] = [
  { Name: "otherapp", Status: "running(1)", ConfigFiles: "/home/user/stacks/otherapp/compose.yml" },
];

function setupDefaultMocks() {
  mockFindBackupArchives.mockImplementation(() => mockProcess(ARCHIVE_PATH + "\n"));
  mockListArchiveContents.mockImplementation(() => mockProcess(ARCHIVE_LISTING));
  mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n    image: nginx\n"));
  mockExtractArchive.mockImplementation(() => mockProcess(""));
  mockFindComposeFiles.mockImplementation(() => mockProcess("/home/user/stacks/myapp/docker-compose.yml\n"));
  mockSaveComposeFile.mockResolvedValue(undefined);
  vi.stubGlobal("cockpit", {
    spawn: vi.fn().mockImplementation((args: string[]) => {
      // ls -d check: fail (path doesn't exist) by default
      if (args[0] === "ls") return mockProcess("", "No such file");
      if (args[0] === "mv") return mockProcess("");
      if (args[0] === "mktemp") return mockProcess("/tmp/restore-test\n");
      if (args[0] === "rm") return mockProcess("");
      if (args[0] === "cat") return mockProcess("services:\n");
      return mockProcess("");
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe("RestoreModal — discovery phase", () => {
  it("auto-scans default scan dir on mount", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => expect(mockFindBackupArchives).toHaveBeenCalledWith("/home/user/stacks"));
  });

  it("shows found archive as a radio option", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/myapp-2026-06-12_12-00-00\.bak\.tar\.gz/)).toBeInTheDocument()
    );
  });

  it("shows no-backups-found alert when scan returns empty", async () => {
    mockFindBackupArchives.mockImplementation(() => mockProcess(""));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() =>
      expect(screen.getByText(/No backups found/i)).toBeInTheDocument()
    );
  });

  it("calls onClose when Cancel clicked", async () => {
    const onClose = vi.fn();
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={onClose}
        onRestored={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("RestoreModal — validation phase", () => {
  it("validates archive and shows detected name when archive is selected", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getAllByDisplayValue("myapp").length).toBeGreaterThan(0)
    );
  });

  it("shows name conflict warning when archive name matches a running stack", async () => {
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByText(/already running/i)).toBeInTheDocument()
    );
    expect(screen.getByRole("textbox", { name: /Restore as name/i })).toBeInTheDocument();
  });

  it("uses name: field from compose file as detected name when present", async () => {
    mockReadFileFromArchive.mockImplementation(() => mockProcess("name: myapp-custom\nservices:\n  web:\n"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getAllByDisplayValue("myapp-custom").length).toBeGreaterThan(0)
    );
  });

  it("Restore button is disabled until validation passes", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: /^Restore$/i })).toBeDisabled();
  });

  it("enables Restore button after successful validation with no conflicts", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
  });
});

describe("RestoreModal — target exists warning", () => {
  beforeEach(() => {
    vi.stubGlobal("cockpit", {
      spawn: vi.fn().mockImplementation((args: string[]) => {
        if (args[0] === "ls") return mockProcess("/home/user/stacks/myapp");
        if (args[0] === "mv") return mockProcess("");
        if (args[0] === "cat") return mockProcess("services:\n");
        return mockProcess("");
      }),
    });
  });

  it("shows target-exists warning when target dir already exists", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    );
  });

  it("Restore button stays disabled until confirmation checkbox checked", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => screen.getByText(/already exists/i));
    expect(screen.getByRole("button", { name: /^Restore$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I understand/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
  });
});

describe("RestoreModal — restore execution", () => {
  it("calls extractArchive and onRestored on successful restore", async () => {
    const onRestored = vi.fn();
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={onRestored}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => screen.getByRole("button", { name: /^Restore$/i, hidden: false }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    expect(onRestored).toHaveBeenCalledWith(expect.objectContaining({ name: "myapp" }));
  });

  it("shows success state after restore completes", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() =>
      expect(screen.getByText(/Stack restored/i)).toBeInTheDocument()
    );
  });

  it("shows error alert when extractArchive fails", async () => {
    mockExtractArchive.mockImplementation(() => mockProcess("", "permission denied"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() =>
      expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
    );
  });

  it("extracts into a temp dir (not parent) when rename is needed, protecting the live folder", async () => {
    // Archive root "otherapp" conflicts with existing stack — will be renamed to "otherapp-restored".
    // extractArchive must receive the temp dir, never the live stacks parent, so the live folder is safe.
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    mockFindComposeFiles.mockImplementation(() =>
      mockProcess("/tmp/restore-test/otherapp/docker-compose.yml\n")
    );
    const spawnMock = vi.fn().mockImplementation((args: string[]) => {
      if (args[0] === "ls" && (args[args.length - 1] ?? "").endsWith("otherapp"))
        return mockProcess(args[args.length - 1] ?? "");
      if (args[0] === "ls") return mockProcess("", "No such file");
      if (args[0] === "mktemp") return mockProcess("/tmp/restore-test\n");
      if (args[0] === "mv") return mockProcess("");
      if (args[0] === "rm") return mockProcess("");
      if (args[0] === "cat") return mockProcess("services:\n");
      return mockProcess("");
    });
    vi.stubGlobal("cockpit", { spawn: spawnMock });
    const onRestored = vi.fn();
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={onRestored}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() => expect(onRestored).toHaveBeenCalledOnce());
    // extractArchive must have been called with the temp dir, NOT the live stacks parent.
    expect(mockExtractArchive).toHaveBeenCalledWith(
      expect.any(String),
      "/tmp/restore-test",
    );
    expect(mockExtractArchive).not.toHaveBeenCalledWith(
      expect.any(String),
      "/home/user/stacks",
    );
  });
});

describe("RestoreModal — scan error and rescan", () => {
  it("shows scan error alert when findBackupArchives fails", async () => {
    mockFindBackupArchives.mockImplementation(() => mockProcess("", "permission denied"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
  });

  it("shows scan error with String(e) when rejection is not an Error", async () => {
    mockFindBackupArchives.mockImplementation(() =>
      Object.assign(
        new Promise<string>((_, reject) => queueMicrotask(() => reject("disk full"))),
        { stream: vi.fn().mockReturnThis(), close: vi.fn(), input: vi.fn() },
      ) as CockpitProcess,
    );
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => expect(screen.getByText(/disk full/i)).toBeInTheDocument());
  });

  it("Rescan button triggers another scan with current scan dir", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => expect(mockFindBackupArchives).toHaveBeenCalledWith("/home/user/stacks"));
    mockFindBackupArchives.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /Rescan/i }));
    await waitFor(() => expect(mockFindBackupArchives).toHaveBeenCalledTimes(1));
  });
});

describe("RestoreModal — validation edge cases", () => {
  it("shows validation error when archive has no root directory", async () => {
    mockListArchiveContents.mockImplementation(() => mockProcess("file.txt\nanother.txt\n"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByText(/Could not determine archive root directory/i)).toBeInTheDocument()
    );
  });

  it("uses rootDir as name when no compose file found in archive", async () => {
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("myapp/\nmyapp/data.json\nmyapp/nginx.conf\n")
    );
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getAllByDisplayValue("myapp").length).toBeGreaterThan(0));
    expect(mockReadFileFromArchive).not.toHaveBeenCalled();
  });

  it("falls back to rootDir when compose file read fails during validation", async () => {
    mockReadFileFromArchive.mockImplementation(() => mockProcess("", "not found"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getAllByDisplayValue("myapp").length).toBeGreaterThan(0));
    expect(mockReadFileFromArchive).toHaveBeenCalled();
  });

  it("shows name slash error when new name contains a slash", async () => {
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
    const newNameInput = screen.getByRole("textbox", { name: /Restore as name/i });
    fireEvent.change(newNameInput, { target: { value: "my/invalid/name" } });
    await waitFor(() =>
      expect(screen.getByText(/must not contain slashes/i)).toBeInTheDocument()
    );
  });

  it("opens manual path section and triggers validation on input", async () => {
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByText(/Enter archive path manually/i));
    const manualInput = await screen.findByPlaceholderText(/\.bak\.tar\.gz/i);
    fireEvent.change(manualInput, { target: { value: "/custom/path/archive.tar.gz" } });
    await waitFor(() =>
      expect(mockListArchiveContents).toHaveBeenCalledWith("/custom/path/archive.tar.gz")
    );
  });
});

describe("RestoreModal — restore with name update in compose file", () => {
  it("updates compose name field when renaming and compose file has a name: entry", async () => {
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    const spawnMock = vi.fn().mockImplementation((args: string[]) => {
      const path = args[args.length - 1] ?? "";
      // Only the extracted source path (ends with "otherapp") should exist
      if (args[0] === "ls" && path.endsWith("otherapp")) return mockProcess(path);
      if (args[0] === "ls") return mockProcess("", "No such file");
      if (args[0] === "mktemp") return mockProcess("/tmp/restore-test\n");
      if (args[0] === "mv") return mockProcess("");
      if (args[0] === "rm") return mockProcess("");
      if (args[0] === "cat") return mockProcess("name: otherapp\nservices:\n  web:\n");
      return mockProcess("");
    });
    vi.stubGlobal("cockpit", { spawn: spawnMock });
    mockFindComposeFiles.mockImplementation(() =>
      mockProcess("/tmp/restore-test/otherapp/docker-compose.yml\n")
    );
    const onRestored = vi.fn();
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={onRestored}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() => expect(mockSaveComposeFile).toHaveBeenCalled());
    expect(mockSaveComposeFile).toHaveBeenCalledWith(
      "/tmp/restore-test/otherapp/docker-compose.yml",
      expect.stringContaining("name: otherapp-restored"),
    );
  });
});

describe("RestoreModal — success state", () => {
  it("Close button in success state calls onClose", async () => {
    const onClose = vi.fn();
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={onClose}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^Restore$/i })).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /^Restore$/i }));
    await waitFor(() => screen.getByText(/Stack restored/i));
    // PatternFly modal has both a header X button and a footer Close button — click the primary footer one
    const closeButtons = screen.getAllByRole("button", { name: /^Close$/i });
    const primaryClose = closeButtons.find(btn => btn.classList.contains("pf-m-primary"));
    fireEvent.click(primaryClose!);
    expect(onClose).toHaveBeenCalled();
  });
});

describe("RestoreModal — target-exists path correctness (regression)", () => {
  it("does NOT show target-exists warning when only the extraction dir exists but the rename dest does not", async () => {
    // Scenario: archive root is "myapp", user renames to "myapp-2" (name conflict forced).
    // Only "myapp/" exists on disk — NOT "myapp-2/". No warning should appear.
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    vi.stubGlobal("cockpit", {
      spawn: vi.fn().mockImplementation((args: string[]) => {
        const path = args[args.length - 1] ?? "";
        // Only the extraction dir "otherapp" exists; the rename dest "otherapp-restored" does not.
        if (args[0] === "ls" && path.endsWith("otherapp")) return mockProcess(path);
        if (args[0] === "ls") return mockProcess("", "No such file");
        if (args[0] === "mv") return mockProcess("");
        if (args[0] === "cat") return mockProcess("services:\n");
        return mockProcess("");
      }),
    });
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    // Should see the name conflict warning (otherapp matches existingStacks)
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
    // But should NOT see "already exists" because the rename dest ("otherapp-restored") doesn't exist
    expect(screen.queryByText(/already exists/i)).not.toBeInTheDocument();
  });

  it("shows target-exists warning when the RENAMED destination already exists", async () => {
    // Scenario: archive root "otherapp", user would rename to "otherapp-restored".
    // "otherapp-restored/" already exists on disk — must warn.
    mockListArchiveContents.mockImplementation(() =>
      mockProcess("otherapp/\notherapp/docker-compose.yml\n")
    );
    mockReadFileFromArchive.mockImplementation(() => mockProcess("services:\n  web:\n"));
    vi.stubGlobal("cockpit", {
      spawn: vi.fn().mockImplementation((args: string[]) => {
        const path = args[args.length - 1] ?? "";
        // The rename dest "otherapp-restored" already exists; extraction dir "otherapp" does not.
        if (args[0] === "ls" && path.endsWith("otherapp-restored")) return mockProcess(path);
        if (args[0] === "ls") return mockProcess("", "No such file");
        if (args[0] === "mv") return mockProcess("");
        if (args[0] === "cat") return mockProcess("services:\n");
        return mockProcess("");
      }),
    });
    render(
      <RestoreModal
        existingStacks={existingStacks}
        defaultScanDir="/home/user/stacks"
        onClose={vi.fn()}
        onRestored={vi.fn()}
      />
    );
    await waitFor(() => screen.getByText(/myapp-2026-06-12/));
    fireEvent.click(screen.getByRole("radio"));
    await waitFor(() => expect(screen.getByText(/already running/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeInTheDocument());
  });
});
