import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { mockProcess } from "../test/helpers";
import { COMPOSE_TEMPLATES } from "../api/templates";

const {
  mockMakeTempDir,
  mockFetchComposeFromGit,
  mockRemoveDirectory,
  mockCreateDirectory,
  mockRead,
  mockReplace,
  mockCockpitFile,
  mockCockpitSpawn,
} = vi.hoisted(() => {
  const mockRead = vi.fn();
  const mockReplace = vi.fn().mockResolvedValue(undefined);
  const mockCockpitFile = vi.fn(() => ({ read: mockRead, replace: mockReplace }));
  return {
    mockMakeTempDir: vi.fn(),
    mockFetchComposeFromGit: vi.fn(),
    mockRemoveDirectory: vi.fn(),
    mockCreateDirectory: vi.fn(),
    mockRead,
    mockReplace,
    mockCockpitFile,
    mockCockpitSpawn: vi.fn(),
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
  };
});

vi.mock("./DownedStacksSection", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./DownedStacksSection")>();
  return {
    ...actual,
    inferComposeRoot: vi.fn(() => "/etc/docker/compose"),
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
  // Default: ls fails (dir does not exist — proceed without folder-exists error)
  mockCockpitSpawn.mockImplementation(() => mockProcess("", "No such file or directory"));
  vi.stubGlobal("cockpit", { spawn: mockCockpitSpawn, file: mockCockpitFile });
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
  fireEvent.click(screen.getByLabelText(
    method === "git" ? /From Git URL/i :
    method === "template" ? /From template/i :
    /Manual/i
  ));
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
    expect(screen.getByLabelText(/From Git URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/From template/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Manual/i)).toBeInTheDocument();
  });

  it("Next is disabled when nothing filled", () => {
    render(<CreateStackModal {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when name has a slash", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "bad/name" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByLabelText(/Manual/i));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when name has a space", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "bad name" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByLabelText(/Manual/i));
    expect(screen.getByRole("button", { name: /Next/i })).toBeDisabled();
  });

  it("Next is disabled when dir is empty", () => {
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.click(screen.getByLabelText(/Manual/i));
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
    fireEvent.click(screen.getByLabelText(/Manual/i));
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

describe("CreateStackModal — folder exists check", () => {
  it("shows error if target folder exists and is non-empty", async () => {
    mockCockpitSpawn.mockImplementation(() => mockProcess("somefile.txt\n"));
    render(<CreateStackModal {...defaultProps} />);
    fireEvent.change(screen.getByPlaceholderText("my-stack"), { target: { value: "mystack" } });
    fireEvent.change(screen.getByPlaceholderText("/etc/docker/compose"), { target: { value: "/etc/compose" } });
    fireEvent.click(screen.getByLabelText(/Manual/i));
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
    fireEvent.click(screen.getByLabelText(/Manual/i));
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
        configFile: "/etc/compose/my-stack/docker-compose.yml",
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
    expect(screen.getByPlaceholderText(/github.com/i)).toBeInTheDocument();
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

  it("successful fetch shows editor and security warning", async () => {
    const yaml = "services:\n  app:\n    image: test:latest\n";
    mockMakeTempDir.mockImplementation(() => mockProcess("/tmp/test123\n"));
    mockFetchComposeFromGit.mockImplementation(() => mockProcess(""));
    mockRead.mockResolvedValue(yaml);

    render(<CreateStackModal {...defaultProps} />);
    await fillSetupAndAdvance("git");
    fireEvent.change(screen.getByPlaceholderText(/github.com/i), {
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
    fireEvent.change(screen.getByPlaceholderText(/github.com/i), {
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
    fireEvent.change(screen.getByPlaceholderText(/github.com/i), {
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
    fireEvent.change(screen.getByPlaceholderText(/github.com/i), {
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
        configFile: "/etc/compose/my-stack/docker-compose.yml",
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
