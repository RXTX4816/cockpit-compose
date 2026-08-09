import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { EnvModal } from "./EnvModal";
import type { ComposeStack } from "../api";

// Mock EnvEditor as a plain textarea so tests can read/write content in raw mode
vi.mock("./EnvEditor", () => ({
  EnvEditor: ({ content, onChange }: { content: string; onChange: (v: string) => void }) => (
    <textarea value={content} data-testid="env-editor-raw" onChange={e => onChange(e.target.value)} />
  ),
}));

// Mock EnvTable with a simple textarea so tests can read/write content
vi.mock("./EnvTable", () => ({
  EnvTable: ({
    content,
    onChange,
    onDuplicatesChange,
  }: {
    content: string;
    onChange: (v: string) => void;
    onDuplicatesChange: (v: boolean) => void;
  }) => (
    <>
      <textarea
        value={content}
        data-testid="env-editor"
        onChange={e => {
          onChange(e.target.value);
          // signal duplicates when the test sets a special sentinel
          onDuplicatesChange(e.target.value.includes("__DUPLICATE__"));
        }}
      />
    </>
  ),
}));

const mockRead = vi.fn();
const mockReplace = vi.fn();
const mockCockpitFile = vi.fn();

function makeSpawnProcess(output = "") {
  const streamCbs: ((data: string) => void)[] = [];
  const p = output
    ? Promise.resolve().then(() => { streamCbs.forEach(cb => cb(output)); })
    : Promise.resolve();
  return {
    stream(cb: (data: string) => void) { streamCbs.push(cb); return this; },
    then(cb: () => unknown) { return p.then(cb); },
    catch(cb: (e: unknown) => unknown) { return p.catch(cb); },
  };
}

const mockSpawn = vi.fn();

beforeEach(() => {
  mockRead.mockReset().mockResolvedValue(null);
  mockReplace.mockReset().mockResolvedValue(undefined);
  mockCockpitFile.mockReset().mockReturnValue({ read: mockRead, replace: mockReplace });
  // By default, findEnvFiles returns empty → falls back to .env
  mockSpawn.mockReset().mockImplementation(() => makeSpawnProcess(""));
  vi.stubGlobal("cockpit", { file: mockCockpitFile, spawn: mockSpawn });
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
    await act(async () => {});
  });

  it("shows spinner while loading", () => {
    mockSpawn.mockImplementation(() => {
      // spawn never resolves → stays in loading state
      return {
        stream() { return this; },
        then() { return new Promise(() => {}); },
        catch() { return this; },
      };
    });
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

  it("shows confirm modal when saving with duplicate keys", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "__DUPLICATE__" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/Save with issues\?/i)).toBeInTheDocument());
    expect(screen.getByText(/Duplicate keys found/i)).toBeInTheDocument();
  });

  it("Save Anyway saves despite duplicate keys", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "__DUPLICATE__" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    fireEvent.click(screen.getByText("Save Anyway"));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
  });

  it("Confirm Cancel dismisses the confirm modal without saving", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "__DUPLICATE__" } });
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

  it("shows tabs when multiple env files are found", async () => {
    mockSpawn.mockImplementation(() => makeSpawnProcess("/path/.env\n/path/.env.prod\n"));
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("tab", { name: ".env" })).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: ".env.prod" })).toBeInTheDocument();
  });

  it("switches to raw editor when Raw button is clicked", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Raw$/i }));
    await waitFor(() => expect(screen.getByTestId("env-editor-raw")).toBeInTheDocument());
    expect(screen.queryByTestId("env-editor")).toBeNull();
  });

  // Regression for #261: a duplicate key introduced purely in Raw mode used to
  // save silently, since EnvTable's onDuplicatesChange (the only thing that
  // set hasDuplicates) never ran while Raw mode was active. handleSave now
  // also re-checks the actual saved content directly, independent of viewMode.
  it("warns on duplicate keys introduced in raw mode, same as table mode", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Raw$/i }));
    await waitFor(() => screen.getByTestId("env-editor-raw"));
    fireEvent.change(screen.getByTestId("env-editor-raw"), { target: { value: "FOO=a\nFOO=b\n" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText(/Duplicate keys found/i)).toBeInTheDocument());
    expect(mockReplace).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Save Anyway/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("FOO=a\nFOO=b\n"));
    expect(onClose).toHaveBeenCalled();
  });

  it("saves raw editor content directly when there are no duplicate keys", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    const onClose = vi.fn();
    render(<EnvModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Raw$/i }));
    await waitFor(() => screen.getByTestId("env-editor-raw"));
    fireEvent.change(screen.getByTestId("env-editor-raw"), { target: { value: "FOO=a\nBAR=b\n" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("FOO=a\nBAR=b\n"));
    expect(onClose).toHaveBeenCalled();
  });

  it("creates a new env file tab via the + button", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /Add new env file/i }));
    const input = await waitFor(() => screen.getByPlaceholderText(".env.prod"));
    fireEvent.change(input, { target: { value: ".env.staging" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create file$/i }));
    await waitFor(() => expect(screen.getByRole("tab", { name: ".env.staging" })).toBeInTheDocument());
  });

  it("Escape key cancels new file form without creating a tab", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /Add new env file/i }));
    const input = await waitFor(() => screen.getByPlaceholderText(".env.prod"));
    fireEvent.change(input, { target: { value: ".env.test" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByPlaceholderText(".env.prod")).toBeNull();
    expect(screen.queryByRole("tab", { name: ".env.test" })).toBeNull();
  });

  it("Enter key submits new file form", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /Add new env file/i }));
    const input = await waitFor(() => screen.getByPlaceholderText(".env.prod"));
    fireEvent.change(input, { target: { value: ".env.test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByRole("tab", { name: ".env.test" })).toBeInTheDocument());
  });

  it("Cancel (✕) button hides new file form", async () => {
    mockRead.mockResolvedValue(null);
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /Add new env file/i }));
    const input = await waitFor(() => screen.getByPlaceholderText(".env.prod"));
    // Find the ✕ cancel button inside the new file form (plain button with text ✕)
    const cancelBtn = screen.getAllByRole("button").find(b => b.textContent?.trim() === "✕");
    expect(cancelBtn).toBeDefined();
    fireEvent.click(cancelBtn!);
    expect(screen.queryByPlaceholderText(".env.prod")).toBeNull();
    // input reference must not be re-used after it's unmounted
    expect(input).not.toBeInTheDocument();
  });

  it("creates file at existing path just activates that tab", async () => {
    mockSpawn.mockImplementation(() => makeSpawnProcess("/path/.env\n/path/.env.prod\n"));
    mockRead.mockResolvedValue("A=1\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("tab", { name: ".env.prod" }));
    fireEvent.click(screen.getByRole("button", { name: /Add new env file/i }));
    const input = await waitFor(() => screen.getByPlaceholderText(".env.prod"));
    fireEvent.change(input, { target: { value: ".env.prod" } });
    fireEvent.click(screen.getByRole("button", { name: /^Create file$/i }));
    // Still only two tabs; no duplicate created
    const tabs = screen.getAllByRole("tab");
    expect(tabs.filter(t => t.textContent === ".env.prod")).toHaveLength(1);
  });

  it("switches back to table mode from raw mode", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Raw$/i }));
    await waitFor(() => screen.getByTestId("env-editor-raw"));
    fireEvent.click(screen.getByRole("button", { name: /^Table$/i }));
    await waitFor(() => expect(screen.getByTestId("env-editor")).toBeInTheDocument());
    expect(screen.queryByTestId("env-editor-raw")).toBeNull();
  });

  it("shows error alert with save error message when saving fails", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    mockReplace.mockRejectedValue(new Error("disk full"));
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => expect(screen.getByText("disk full")).toBeInTheDocument());
  });

  it("switches to second tab and loads its file", async () => {
    mockSpawn.mockImplementation(() => makeSpawnProcess("/path/.env\n/path/.env.prod\n"));
    mockRead.mockResolvedValue("INITIAL=1\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("tab", { name: ".env.prod" }));
    // Click the second tab
    fireEvent.click(screen.getByRole("tab", { name: ".env.prod" }));
    // The second tab is loaded (mockRead called again for that path)
    await waitFor(() => expect(mockRead).toHaveBeenCalledTimes(2));
  });

  it("closes confirm-save modal when the X (onClose) is clicked", async () => {
    mockRead.mockResolvedValue("FOO=bar\n");
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId("env-editor"));
    fireEvent.change(screen.getByTestId("env-editor"), { target: { value: "__DUPLICATE__" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save$/i }));
    await waitFor(() => screen.getByText(/Save with issues\?/i));
    // Click the X on the confirm modal (first "Close" button in the confirm dialog scope)
    const confirmModal = screen.getByRole("dialog", { name: /Confirm save/i });
    const xBtn = within(confirmModal).getAllByRole("button").find(b =>
      b.getAttribute("aria-label")?.toLowerCase().includes("close")
    );
    if (xBtn) fireEvent.click(xBtn);
    await waitFor(() => expect(screen.queryByText(/Save with issues\?/i)).toBeNull());
  });

  it("shows error alert when findEnvFiles spawn fails", async () => {
    mockSpawn.mockImplementation(() => ({
      stream() { return this; },
      then() { return Promise.reject(new Error("spawn failed")); },
      catch(fn: (e: unknown) => void) { Promise.resolve().then(() => fn(new Error("spawn failed"))); return this; },
    }));
    render(<EnvModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not read file/i)).toBeInTheDocument());
  });
});
