import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { EnvModal } from "./EnvModal";
import type { ComposeStack } from "../api";

vi.mock("./EnvEditor", () => ({
  EnvEditor: ({ content, onChange }: { content: string; onChange?: (v: string) => void }) => (
    <textarea value={content} data-testid="env-editor" onChange={e => onChange?.(e.target.value)} />
  ),
}));

const mockRead = vi.fn();
const mockReplace = vi.fn();
const mockCockpitFile = vi.fn();

beforeEach(() => {
  mockRead.mockReset().mockResolvedValue(null);
  mockReplace.mockReset().mockResolvedValue(undefined);
  mockCockpitFile.mockReset().mockReturnValue({ read: mockRead, replace: mockReplace });
  vi.stubGlobal("cockpit", { file: mockCockpitFile });
});

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

describe("EnvModal", () => {
  it("shows Create button when env file does not exist", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Create/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /^Save$/i })).toBeNull();
  });

  it("shows Save button when env file exists", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Save$/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Create/i })).toBeNull();
  });

  it("shows Save button when env file exists but is empty", async () => {
    mockRead.mockResolvedValue("");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Save$/i })).toBeInTheDocument());
  });

  it("displays env file path", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/path/.env")).toBeInTheDocument());
  });

  it("shows modal title with stack name", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp — env file/i)).toBeInTheDocument();
  });

  it("shows spinner while loading", () => {
    mockRead.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows existing env file content in editor", async () => {
    mockRead.mockResolvedValue("FOO=bar\nBAZ=qux\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("env-editor")).toHaveValue("FOO=bar\nBAZ=qux\n"));
  });

  it("saves file content on Create click (no issues)", async () => {
    mockRead.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "FOO=bar\n" } });
    fireEvent.click(screen.getByRole("button", { name: /Create/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("FOO=bar\n"));
    expect(onClose).toHaveBeenCalled();
  });

  it("saves file content on Save click (no issues)", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "FOO=updated\n" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("FOO=updated\n"));
    expect(onClose).toHaveBeenCalled();
  });

  it("shows confirm modal when saving with lint errors", async () => {
    mockRead.mockResolvedValue("INVALID LINE\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/Save with issues\?/i)).toBeInTheDocument());
    expect(screen.getByText(/Errors found/i)).toBeInTheDocument();
  });

  it("shows confirm modal when saving with lint warnings", async () => {
    mockRead.mockResolvedValue("KEY = value\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/Save with issues\?/i)).toBeInTheDocument());
    expect(screen.getByText(/Warnings found/i)).toBeInTheDocument();
  });

  it("Save Anyway saves despite lint issues", async () => {
    mockRead.mockResolvedValue("INVALID LINE\n");
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    fireEvent.click(screen.getByText("Save Anyway"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("Confirm Cancel dismisses the confirm modal without saving", async () => {
    mockRead.mockResolvedValue("INVALID LINE\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    const confirmDialog = screen.getByRole("dialog", { name: "Confirm save", hidden: true });
    fireEvent.click(within(confirmDialog).getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText(/Save with issues\?/i)).toBeNull());
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("Cancel button closes the modal without saving", async () => {
    mockRead.mockResolvedValue(null);
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("shows error alert when reading env file fails", async () => {
    mockRead.mockRejectedValue(new Error("permission denied"));
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not read file/i)).toBeInTheDocument());
  });
});
