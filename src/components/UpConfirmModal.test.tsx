import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UpConfirmModal } from "./UpConfirmModal";
import type { ComposeStack } from "../api";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, readComposeFile: vi.fn() };
});

import { readComposeFile } from "../api";
const mockReadComposeFile = vi.mocked(readComposeFile);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

beforeEach(() => {
  mockReadComposeFile.mockImplementation(() => mockProcess(""));
});

describe("UpConfirmModal", () => {
  it("renders title with stack name", async () => {
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Up — myapp/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows warning alert about container recreation", async () => {
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/recreated/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("calls onConfirm when Up clicked", async () => {
    const onConfirm = vi.fn();
    render(<UpConfirmModal stack={stack} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onClose when Cancel clicked", async () => {
    const onClose = vi.fn();
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("shows image list parsed from compose YAML", async () => {
    const yaml = "services:\n  web:\n    image: nginx:latest\n  db:\n    image: postgres:16\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/nginx:latest/)).toBeInTheDocument();
      expect(screen.getByText(/postgres:16/)).toBeInTheDocument();
    });
  });

  it("marks :latest images as unpinned", async () => {
    const yaml = "services:\n  web:\n    image: nginx:latest\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/unpinned/i).length).toBeGreaterThan(0));
  });

  it("marks untagged images as unpinned", async () => {
    const yaml = "services:\n  web:\n    image: nginx\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/unpinned/i).length).toBeGreaterThan(0));
  });

  it("does not mark pinned version tags as unpinned", async () => {
    const yaml = "services:\n  db:\n    image: postgres:16\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/postgres:16/)).toBeInTheDocument());
    expect(screen.queryByText(/unpinned/i)).not.toBeInTheDocument();
  });

  it("skips build-only services", async () => {
    const yaml = "services:\n  buildonly:\n    build: .\n  web:\n    image: nginx:1.25\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nginx:1.25/)).toBeInTheDocument());
    expect(screen.queryByText(/buildonly/)).not.toBeInTheDocument();
  });

  it("uses first ConfigFile from comma-separated list", async () => {
    const multiStack: ComposeStack = { ...stack, ConfigFiles: "/a.yml, /b.yml" };
    render(<UpConfirmModal stack={multiStack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(mockReadComposeFile).toHaveBeenCalledWith("/a.yml");
    await act(async () => {});
  });
});
