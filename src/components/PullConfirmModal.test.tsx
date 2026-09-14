import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PullConfirmModal } from "./PullConfirmModal";
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

describe("PullConfirmModal", () => {
  it("renders title with stack name", async () => {
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/Pull latest images — myapp/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows warning alert", async () => {
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText(/breaking changes/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("calls onConfirm when Pull clicked", async () => {
    const onConfirm = vi.fn();
    render(<PullConfirmModal stack={stack} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Pull$/i }));
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("calls onClose when Cancel clicked", async () => {
    const onClose = vi.fn();
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("shows image list parsed from compose YAML", async () => {
    const yaml = "services:\n  web:\n    image: nginx:latest\n  db:\n    image: postgres:16\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText(/nginx:latest/)).toBeInTheDocument();
      expect(screen.getByText(/postgres:16/)).toBeInTheDocument();
    });
  });

  it("marks :latest images as unpinned", async () => {
    const yaml = "services:\n  web:\n    image: nginx:latest\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/unpinned/i).length).toBeGreaterThan(0));
  });

  it("marks untagged images as unpinned", async () => {
    const yaml = "services:\n  web:\n    image: nginx\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getAllByText(/unpinned/i).length).toBeGreaterThan(0));
  });

  it("does not mark pinned version tags as unpinned", async () => {
    const yaml = "services:\n  db:\n    image: postgres:16\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/postgres:16/)).toBeInTheDocument());
    expect(screen.queryByText(/unpinned/i)).not.toBeInTheDocument();
  });

  it("skips build-only services", async () => {
    const yaml = "services:\n  buildonly:\n    build: .\n  web:\n    image: nginx:1.25\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nginx:1.25/)).toBeInTheDocument());
    expect(screen.queryByText(/buildonly/)).not.toBeInTheDocument();
  });
});

// #287: Compose 5.5.0 honours pull_policy refresh windows. Reading pull_policy at
// all also makes the existing unpinned warning correct for policies that never
// re-fetch — ":latest" is not a moving target if nothing is allowed to move it.
describe("PullConfirmModal — pull_policy awareness", () => {
  const withCompose = (yaml: string) => {
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<PullConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
  };

  it("shows the pull policy next to a service that sets one", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: weekly\n");
    expect(await screen.findByText("pull policy: weekly")).toBeInTheDocument();
  });

  it("shows no policy label for a service that does not set one", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n");
    await screen.findByText("nginx:latest");
    expect(screen.queryByText(/pull policy:/)).toBeNull();
  });

  it("still warns about an unpinned image on a refresh window", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: daily\n");
    expect(await screen.findByText(/unpinned/)).toBeInTheDocument();
  });

  it("does not warn about an unpinned image the policy will never re-fetch", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: never\n");
    await screen.findByText("nginx:latest");
    expect(screen.queryByText(/unpinned/)).toBeNull();
  });

  it("renders a compose file from an older Compose unchanged", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: if_not_present\n");
    expect(await screen.findByText("pull policy: if_not_present")).toBeInTheDocument();
    expect(screen.queryByText(/unpinned/)).toBeNull();
  });
});
