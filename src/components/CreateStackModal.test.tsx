import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { mockProcess } from "../test/helpers";
import { COMPOSE_TEMPLATES } from "../api/templates";

const {
  mockMakeTempDir,
  mockFetchComposeFromGit,
  mockRemoveDirectory,
  mockCreateDirectory,
  mockIsRootlessMode,
  mockRead,
  mockReplace,
  mockCockpitFile,
  mockCockpitSpawn,
  mockCockpitUser,
} = vi.hoisted(() => {
  const mockRead = vi.fn();
  const mockReplace = vi.fn().mockResolvedValue(undefined);
  const mockCockpitFile = vi.fn(() => ({ read: mockRead, replace: mockReplace }));
  return {
    mockMakeTempDir: vi.fn(),
    mockFetchComposeFromGit: vi.fn(),
    mockRemoveDirectory: vi.fn(),
    mockCreateDirectory: vi.fn(),
    mockIsRootlessMode: vi.fn(() => false),
    mockRead,
    mockReplace,
    mockCockpitFile,
    mockCockpitSpawn: vi.fn(),
    mockCockpitUser: vi.fn().mockResolvedValue({ home: "/home/test" }),
  };
});

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    makeTempDir: mockMakeTempDir,
    fetchComposeFromGit: mockFetchComposeFromGit,
    removeDirectory: mockRemoveDirectory,
    createDirectory: mockCreateDirectory,
    isRootlessMode: mockIsRootlessMode,
  };
});

const { mockInferComposeRoot } = vi.hoisted(() => ({
  mockInferComposeRoot: vi.fn(() => "/etc/docker/compose"),
}));

vi.mock("./DownedStacksSection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./DownedStacksSection")>();
  return {
    ...actual,
    inferComposeRoot: mockInferComposeRoot,
  };
});

vi.mock("./YamlEditor", () => ({
  YamlEditor: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea data-testid="yaml-editor" value={content} onChange={e => onChange(e.target.value)} readOnly={false} />
  ),
}));

beforeEach(() => {
  mockMakeTempDir.mockReset();
  mockFetchComposeFromGit.mockReset();
  mockRemoveDirectory.mockReset().mockImplementation(() => mockProcess(""));
  mockCreateDirectory.mockReset().mockImplementation(() => mockProcess(""));
  mockRead.mockReset();
  mockReplace.mockReset().mockResolvedValue(undefined);
  mockCockpitFile.mockReset().mockReturnValue({ read: mockRead, replace: mockReplace });
  mockCockpitSpawn.mockReset();
  mockIsRootlessMode.mockReset().mockReturnValue(false);
  mockInferComposeRoot.mockReset().mockReturnValue("/etc/docker/compose");
  mockCockpitUser.mockReset().mockResolvedValue({ home: "/home/test" });
  // Default: ls fails (dir does not exist — proceed without folder-exists error)
  mockCockpitSpawn.mockImplementation(() => mockProcess("", "No such file or directory"));
  vi.stubGlobal("cockpit", { spawn: mockCockpitSpawn, file: mockCockpitFile, user: mockCockpitUser });
});

import { CreateStackModal } from "./CreateStackModal";

const noop = vi.fn();
const defaultProps = {
  stacks: [],
  onClose: noop,
  onCreated: noop,
};

const activeStacks = [
  { Name: "myapp", Status: "running(1)", ConfigFiles: "/etc/docker/compose/myapp/docker-compose.yml" },
];

/** Fill step 1 with valid values and advance to step 2 */
async function fillSetupAndAdvance(method: "git" | "template" | "manual" = "manual") {
  fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "my-stack" } });
  fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
  // Method is now an icon tile button, not a radio input
  fireEvent.click(screen.getByRole("button", {
    name: method === "git" ? /From Git URL/i :
          method === "template" ? /From template/i :
          /Manual/i,
  }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Next/i }));
  });
  await waitFor(() => expect(screen.queryByRole("button", { name: /Next/i })).not.toBeInTheDocument());
}

describe("CreateStackModal — step 1 rendering", () => {
  it("renders all step 1 fields", () => {
    render(<CreateStackModal {...defaultProps} />);
    expect(screen.getByPlaceholderText("my-stack")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("/etc/docker/compose")).toBeInTheDocument();
    // Method is now icon tiles (buttons), not radio inputs
    expect(screen.getByRole("button", { name: /From Git URL/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /From template/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Manual/i })).toBeInTheDocument();
  });

  it("Next is disabled when nothing filled", () => {
    // Name is auto-filled; dir and method are still empty/unset with empty stacks prop
    render(<CreateStackModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when name has a slash", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "bad/name" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when name has a space", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "bad name" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when dir is empty", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when method not selected", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is enabled when all fields valid", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    expect(screen.getByRole("button", { name: /Next/i })).not.toBeDisabled();
  });

  it("Find best match is disabled with no active stacks", () => {
    render(<CreateStackModal {...defaultProps} stacks={[]} />);
    expect(screen.getByRole("button", { name: /Find best match/i })).toBeDisabled();
  });

  it("Find best match fills dir with inferred root", () => {
    render(<CreateStackModal {...defaultProps} stacks={activeStacks} />);
    fireEvent.click(screen.getByRole("button", { name: /Find best match/i }));
    const dirInput = screen.getByPlaceholderText("/etc/docker/compose") as HTMLInputElement;
    expect(dirInput.value).toBe("/etc/docker/compose");
  });

  it("Cancel calls onClose", () => {
    const onClose = vi.fn();
    render(<CreateStackModal {...defaultProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe("CreateStackModal — rootless compose dir suggestion (no stacks yet)", () => {
  beforeEach(() => {
    // No stacks yet: inferComposeRoot returns "" as it would for a real empty list
    mockInferComposeRoot.mockReturnValue("");
  });

  it("defaults to the user's home directory when rootless", async () => {
    mockIsRootlessMode.mockReturnValue(true);
    render(<CreateStackModal {...defaultProps} stacks={[]} />);
    await waitFor(() => {
      const dirInput = screen.getByPlaceholderText("/etc/docker/compose") as HTMLInputElement;
      expect(dirInput.value).toBe("/home/test/compose");
    });
  });

  it("keeps the field empty (default placeholder) when rootful", async () => {
    mockIsRootlessMode.mockReturnValue(false);
    render(<CreateStackModal {...defaultProps} stacks={[]} />);
    const dirInput = screen.getByPlaceholderText("/etc/docker/compose") as HTMLInputElement;
    expect(dirInput.value).toBe("");
  });
});

describe("CreateStackModal — folder exists check", () => {
  it("shows error if target folder exists and is non-empty", async () => {
    mockCockpitSpawn.mockImplementation(() => mockProcess("somefile.txt\n"));
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    });
    await waitFor(() => expect(screen.getByText(/already exists and is not empty/i)).toBeInTheDocument());
    // should still be on step 1
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
  });

  it("proceeds to step 2 if target folder does not exist", async () => {
    mockCockpitSpawn.mockImplementation(() => mockProcess("", "No such file"));
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByRole("button", { name: /Manual/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Next/i }));
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: /Next/i })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Create/i })).toBeInTheDocument();
  });
});

describe("CreateStackModal — step 2 manual", () => {
  it("shows YamlEditor with stub content", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
  });

  it("Back returns to step 1", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /← Back/i }));
    expect(screen.getByRole("button", { name: /Next/i })).toBeInTheDocument();
  });

  it("Create calls createDirectory, file.replace, onCreated", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("manual");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    });
    await waitFor(() => {
      expect(mockCreateDirectory).toHaveBeenCalledWith("/etc/compose/my-stack", "try");
      expect(mockCockpitFile).toHaveBeenCalledWith("/etc/compose/my-stack/docker-compose.yml", { superuser: "try" });
      expect(mockReplace).toHaveBeenCalled();
      expect(onCreated).toHaveBeenCalledWith({
        name: "my-stack",
        configFiles: ["/etc/compose/my-stack/docker-compose.yml"],
      });
    });
  });

  it("invalid YAML shows confirm dialog instead of creating", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: [unclosed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    expect(screen.getByText(/Create with issues\?/i)).toBeInTheDocument();
    expect(screen.getByText(/Errors found/i)).toBeInTheDocument();
    expect(mockCreateDirectory).not.toHaveBeenCalled();
  });

  it("Create Anyway proceeds despite errors", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("manual");
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: [unclosed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => screen.getByText(/Create with issues\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Create Anyway"));
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("Cancel on confirm dialog dismisses it without creating", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: [unclosed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => screen.getByText(/Create with issues\?/i));
    const confirmDialog = screen.getByRole("dialog", { name: "Confirm create", hidden: true });
    fireEvent.click(within(confirmDialog).getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText(/Create with issues\?/i)).not.toBeInTheDocument());
    expect(mockCreateDirectory).not.toHaveBeenCalled();
  });
});

describe("CreateStackModal — step 2 template", () => {
  it("shows all template cards", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("template");
    for (const t of COMPOSE_TEMPLATES) {
      expect(screen.getByText(t.name)).toBeInTheDocument();
    }
  });

  it("Create is disabled until a template is selected", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("template");
    expect(screen.getByRole("button", { name: /Create/i })).toBeDisabled();
  });

  it("selecting a template enables Create and shows preview", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("template");
    fireEvent.click(screen.getByText(COMPOSE_TEMPLATES[0].name));
    expect(screen.getByRole("button", { name: /Create/i })).not.toBeDisabled();
    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
  });

  it("Create calls onCreated with selected template yaml", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("template");
    fireEvent.click(screen.getByText(COMPOSE_TEMPLATES[0].name));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith(COMPOSE_TEMPLATES[0].yaml);
      expect(onCreated).toHaveBeenCalled();
    });
  });
});

describe("CreateStackModal — step 2 git url", () => {
  it("shows URL input and Fetch button", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    expect(screen.getByPlaceholderText(/^https:\/\/github\.com\//i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Fetch/i })).toBeInTheDocument();
  });

  it("Fetch is disabled when URL is empty", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    expect(screen.getByRole("button", { name: /Fetch/i })).toBeDisabled();
  });

  it("Create is disabled before fetch", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    expect(screen.getByRole("button", { name: /Create/i })).toBeDisabled();
  });

  it("rejects non-https URL without cloning", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "file:///etc/passwd" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/only http/i)).toBeInTheDocument();
    });
    expect(mockFetchComposeFromGit).not.toHaveBeenCalled();
  });

  it("rejects non-URL string without cloning", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "../../../etc/passwd" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/only http/i)).toBeInTheDocument();
    });
    expect(mockFetchComposeFromGit).not.toHaveBeenCalled();
  });

  it("successful fetch shows editor and security warning", async () => {
    const yaml = "services:\n  app:\n    image: test:latest\n";
    mockMakeTempDir.mockImplementation(() => mockProcess("/tmp/test123\n"));
    mockFetchComposeFromGit.mockImplementation(() => mockProcess(""));
    mockRead.mockResolvedValue(yaml);

    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "https://example.com/repo.git" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => {
      expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
      expect(screen.getByText(/review compose files from external sources/i)).toBeInTheDocument();
    });
  });

  it("shows error when no compose file found in repo", async () => {
    mockMakeTempDir.mockImplementation(() => mockProcess("/tmp/test123\n"));
    mockFetchComposeFromGit.mockImplementation(() => mockProcess(""));
    mockRead.mockResolvedValue(null); // all candidates return null

    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "https://example.com/repo.git" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/No compose file found/i)).toBeInTheDocument();
    });
  });

  it("shows error when git clone fails", async () => {
    mockMakeTempDir.mockImplementation(() => mockProcess("/tmp/test123\n"));
    mockFetchComposeFromGit.mockImplementation(() => mockProcess("", "Repository not found"));

    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "https://example.com/repo.git" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Repository not found/i)).toBeInTheDocument();
    });
  });

  it("Create after successful fetch calls onCreated", async () => {
    const yaml = "services:\n  app:\n    image: test:latest\n";
    mockMakeTempDir.mockImplementation(() => mockProcess("/tmp/test123\n"));
    mockFetchComposeFromGit.mockImplementation(() => mockProcess(""));
    mockRead.mockResolvedValue(yaml);

    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/^https:\/\/github\.com\//i), {
      target: { value: "https://example.com/repo.git" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Fetch/i }));
    });
    await waitFor(() => expect(screen.getByTestId("yaml-editor")).toBeInTheDocument());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    });
    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({
        name: "my-stack",
        configFiles: ["/etc/compose/my-stack/docker-compose.yml"],
      });
    });
  });
});

describe("CreateStackModal — additional files", () => {
  it("Add file button is present in step 2", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    expect(screen.getByRole("button", { name: /\+ Add file/i })).toBeInTheDocument();
  });

  it("clicking Add file shows a filename input and yaml editor", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    expect(screen.getByPlaceholderText("docker-compose.prod.yml")).toBeInTheDocument();
    expect(screen.getAllByTestId("yaml-editor")).toHaveLength(2);
  });

  it("info alert shown when at least one additional file is added", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    expect(screen.getByText(/must contain a services: key/i)).toBeInTheDocument();
  });

  it("Remove button removes the additional file entry", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    expect(screen.getAllByTestId("yaml-editor")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /Remove/i }));
    expect(screen.getAllByTestId("yaml-editor")).toHaveLength(1);
  });

  it("Create is disabled when additional filename is empty", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    // filename input is empty — canCreate should be false
    expect(screen.getByRole("button", { name: /^Create$/i })).toBeDisabled();
  });

  it("Create is disabled when additional filename has no yml/yaml extension", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    fireEvent.change(screen.getByPlaceholderText("docker-compose.prod.yml"), {
      target: { value: "not-a-yaml" },
    });
    expect(screen.getByRole("button", { name: /^Create$/i })).toBeDisabled();
  });

  it("Create is disabled when additional filename duplicates primary", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    fireEvent.change(screen.getByPlaceholderText("docker-compose.prod.yml"), {
      target: { value: "docker-compose.yml" },
    });
    expect(screen.getByRole("button", { name: /^Create$/i })).toBeDisabled();
  });

  it("Create with valid additional file writes both files and calls onCreated with both paths", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    fireEvent.change(screen.getByPlaceholderText("docker-compose.prod.yml"), {
      target: { value: "docker-compose.prod.yml" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledTimes(2);
      expect(mockCockpitFile).toHaveBeenCalledWith(
        "/etc/compose/my-stack/docker-compose.prod.yml",
        expect.objectContaining({ superuser: expect.anything() })
      );
      expect(onCreated).toHaveBeenCalledWith({
        name: "my-stack",
        configFiles: [
          "/etc/compose/my-stack/docker-compose.yml",
          "/etc/compose/my-stack/docker-compose.prod.yml",
        ],
      });
    });
  });
});

describe("CreateStackModal — create error", () => {
  it("shows inline error when createDirectory fails", async () => {
    mockCreateDirectory.mockImplementation(() => mockProcess("", "Permission denied"));
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    });
    await waitFor(() => {
      expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
    });
  });
});

describe("CreateStackModal — compose schema warnings", () => {
  it("valid but non-conforming YAML shows warnings (not errors) in the confirm dialog", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    // Parses fine as YAML/JSON but has an unknown top-level property, which
    // validateComposeSpec flags as a schema warning rather than a parse error.
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: test:latest\nnot_a_real_key: true\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => expect(screen.getByText(/Create with issues\?/i)).toBeInTheDocument());
    expect(screen.getByText(/Warnings found/i)).toBeInTheDocument();
    expect(screen.queryByText(/Errors found/i)).not.toBeInTheDocument();
    expect(mockCreateDirectory).not.toHaveBeenCalled();
  });

  it("Create Anyway proceeds despite warnings", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("manual");
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: test:latest\nnot_a_real_key: true\n" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => screen.getByText(/Create with issues\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Create Anyway"));
    });
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });

  it("closing the confirm dialog via its own onClose (Escape) dismisses it without creating", async () => {
    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("manual");
    fireEvent.change(screen.getByTestId("yaml-editor"), {
      target: { value: "services:\n  web:\n    image: [unclosed" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    const confirmDialog = await screen.findByRole("dialog", { name: "Confirm create", hidden: true });
    fireEvent.keyDown(confirmDialog, { key: "Escape", code: "Escape" });
    await waitFor(() => expect(screen.queryByText(/Create with issues\?/i)).not.toBeInTheDocument());
    expect(mockCreateDirectory).not.toHaveBeenCalled();
  });
});

describe("CreateStackModal — additional file content editing", () => {
  it("editing an additional file's YAML content updates its stored content and is written on create", async () => {
    const onCreated = vi.fn();
    render(<CreateStackModal {...defaultProps} onCreated={onCreated} />);
    await fillSetupAndAdvance("manual");
    fireEvent.click(screen.getByRole("button", { name: /\+ Add file/i }));
    fireEvent.change(screen.getByPlaceholderText("docker-compose.prod.yml"), {
      target: { value: "docker-compose.prod.yml" },
    });
    const editors = screen.getAllByTestId("yaml-editor");
    // editors[0] is the primary manual editor, editors[1] is the additional file's editor
    fireEvent.change(editors[1], {
      target: { value: "services:\n  extra:\n    image: extra:latest\n" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Create$/i }));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("services:\n  extra:\n    image: extra:latest\n");
      expect(onCreated).toHaveBeenCalled();
    });
  });
});
