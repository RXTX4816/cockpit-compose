import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act, within } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

const { mockRemoveFile, mockRemoveDirectory } = vi.hoisted(() => ({
  mockRemoveFile: vi.fn(),
  mockRemoveDirectory: vi.fn(),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, removeFile: mockRemoveFile, removeDirectory: mockRemoveDirectory };
});

import { DeleteStackModal } from "./DeleteStackModal";

const stack = {
  name: "myapp",
  configFiles: ["/etc/docker/compose/myapp/docker-compose.yml"],
};

const multiFileStack = {
  name: "myapp",
  configFiles: [
    "/etc/docker/compose/myapp/docker-compose.yml",
    "/etc/docker/compose/myapp/docker-compose.prod.yml",
  ],
};

const noop = vi.fn();

beforeEach(() => {
  noop.mockReset();
  mockRemoveFile.mockReset().mockImplementation(() => mockProcess(""));
  mockRemoveDirectory.mockReset().mockImplementation(() => mockProcess(""));
});

describe("DeleteStackModal", () => {
  it("renders stack name in title", () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    expect(screen.getByText(/Delete — myapp/i)).toBeInTheDocument();
  });

  it("shows the compose file path", () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    expect(screen.getByText(stack.configFiles[0])).toBeInTheDocument();
  });

  it("shows the folder path in checkbox description", () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    expect(screen.getByText(/Removes the folder.*myapp/i)).toBeInTheDocument();
  });

  it("Delete folder checkbox is unchecked by default", () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    const cb = screen.getByRole("checkbox") as HTMLInputElement;
    expect(cb.checked).toBe(false);
  });

  it("Cancel calls onClose", () => {
    const onClose = vi.fn();
    render(<DeleteStackModal stack={stack} onClose={onClose} onDeleted={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("first Delete click shows second confirmation modal", async () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => expect(screen.getByText(/Are you really sure\?/i)).toBeInTheDocument());
    expect(screen.getByText("Yes, delete")).toBeInTheDocument();
  });

  it("Cancel on second confirm dismisses it without deleting", async () => {
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    const confirmDialog = screen.getByRole("dialog", { name: "Confirm delete", hidden: true });
    fireEvent.click(within(confirmDialog).getByText("Cancel"));
    await waitFor(() => expect(screen.queryByText(/Are you really sure\?/i)).not.toBeInTheDocument());
    expect(mockRemoveFile).not.toHaveBeenCalled();
  });

  it("Yes, delete (no folder) calls removeFile", async () => {
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    render(<DeleteStackModal stack={stack} onClose={onClose} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => {
      expect(mockRemoveFile).toHaveBeenCalledWith(stack.configFiles[0]);
      expect(mockRemoveDirectory).not.toHaveBeenCalled();
      expect(onDeleted).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("Yes, delete with folder checked calls removeDirectory", async () => {
    const onDeleted = vi.fn();
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => {
      expect(mockRemoveDirectory).toHaveBeenCalledWith("/etc/docker/compose/myapp");
      expect(mockRemoveFile).not.toHaveBeenCalled();
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("shows inline error when deletion fails", async () => {
    mockRemoveFile.mockImplementation(() => mockProcess("", "Permission denied"));
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => {
      expect(screen.getByText(/Permission denied/i)).toBeInTheDocument();
    });
  });

  it("multi-file: shows all file paths in the body", () => {
    render(<DeleteStackModal stack={multiFileStack} onClose={noop} onDeleted={noop} />);
    expect(screen.getByText("/etc/docker/compose/myapp/docker-compose.yml")).toBeInTheDocument();
    expect(screen.getByText("/etc/docker/compose/myapp/docker-compose.prod.yml")).toBeInTheDocument();
  });

  it("multi-file: file-only delete calls removeFile for each file", async () => {
    const onDeleted = vi.fn();
    const onClose = vi.fn();
    render(<DeleteStackModal stack={multiFileStack} onClose={onClose} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => {
      expect(mockRemoveFile).toHaveBeenCalledWith("/etc/docker/compose/myapp/docker-compose.yml");
      expect(mockRemoveFile).toHaveBeenCalledWith("/etc/docker/compose/myapp/docker-compose.prod.yml");
      expect(mockRemoveFile).toHaveBeenCalledTimes(2);
      expect(mockRemoveDirectory).not.toHaveBeenCalled();
      expect(onDeleted).toHaveBeenCalled();
    });
  });

  it("multi-file: confirm target shows file count", async () => {
    render(<DeleteStackModal stack={multiFileStack} onClose={noop} onDeleted={noop} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    expect(screen.getByText(/2 compose files/i)).toBeInTheDocument();
  });

  it("multi-file: partial failure shows error and does not call onDeleted", async () => {
    mockRemoveFile
      .mockImplementationOnce(() => mockProcess(""))
      .mockImplementationOnce(() => mockProcess("", "Permission denied"));
    const onDeleted = vi.fn();
    render(<DeleteStackModal stack={multiFileStack} onClose={noop} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => expect(screen.getByText(/Permission denied/i)).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  });

  it("does not call onDeleted when deletion fails", async () => {
    mockRemoveFile.mockImplementation(() => mockProcess("", "Permission denied"));
    const onDeleted = vi.fn();
    render(<DeleteStackModal stack={stack} onClose={noop} onDeleted={onDeleted} />);
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));
    await waitFor(() => screen.getByText(/Are you really sure\?/i));
    await act(async () => {
      fireEvent.click(screen.getByText("Yes, delete"));
    });
    await waitFor(() => expect(screen.getByText(/Permission denied/i)).toBeInTheDocument());
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
