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

  it("calls onConfirm with empty profiles when Up clicked and none selected", async () => {
    const onConfirm = vi.fn();
    render(<UpConfirmModal stack={stack} onConfirm={onConfirm} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(onConfirm).toHaveBeenCalledWith([]);
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

  it("shows profiles checklist when compose file has profiled services", async () => {
    const yaml = "services:\n  always:\n    image: nginx\n  debug:\n    image: busybox\n    profiles: [dev]\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("dev")).toBeInTheDocument());
    expect(screen.getByText(/Optional profiles/i)).toBeInTheDocument();
  });

  it("does not show profiles section when no profiled services", async () => {
    const yaml = "services:\n  web:\n    image: nginx\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nginx/)).toBeInTheDocument());
    expect(screen.queryByText(/Optional profiles/i)).not.toBeInTheDocument();
  });

  it("calls onConfirm with selected profiles", async () => {
    const yaml = "services:\n  debug:\n    image: busybox\n    profiles: [dev]\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    const onConfirm = vi.fn();
    render(<UpConfirmModal stack={stack} onConfirm={onConfirm} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /dev/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: /dev/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(onConfirm).toHaveBeenCalledWith(["dev"]);
  });

  it("omits deselected profiles from onConfirm call", async () => {
    const yaml = "services:\n  debug:\n    image: busybox\n    profiles: [dev]\n";
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    const onConfirm = vi.fn();
    render(<UpConfirmModal stack={stack} onConfirm={onConfirm} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("checkbox", { name: /dev/i })).toBeInTheDocument());
    // checkbox starts unchecked — do not click it
    fireEvent.click(screen.getByRole("button", { name: /^Up$/i }));
    expect(onConfirm).toHaveBeenCalledWith([]);
  });
});

// #287: same pull_policy awareness as PullConfirmModal — the "may pull a newer
// version" half of this dialog's warning only applies to services whose policy
// actually permits a fetch.
describe("UpConfirmModal — pull_policy awareness", () => {
  const withCompose = (yaml: string) => {
    mockReadComposeFile.mockImplementation(() => mockProcess(yaml));
    render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
  };

  it("shows a compose 5.5.0 refresh window next to the service", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: every_12h\n");
    expect(await screen.findByText("pull policy: every_12h")).toBeInTheDocument();
    expect(screen.getByText(/unpinned/)).toBeInTheDocument();
  });

  it("does not warn about an unpinned image pinned in practice by pull_policy: never", async () => {
    withCompose("services:\n  web:\n    image: nginx:latest\n    pull_policy: never\n");
    await screen.findByText("nginx:latest");
    expect(screen.queryByText(/unpinned/)).toBeNull();
  });

  describe("jobs (Compose 5.6.0)", () => {
    const withJobs = `
services:
  web:
    image: nginx:1.27
jobs:
  migrate:
    image: app:1
    triggers:
      manual: true
  nightly:
    image: app:1
    profiles: [ops]
    triggers:
      schedule: ["0 3 * * *"]
`;

    it("lists declared jobs and explains that Up does not start them", async () => {
      mockReadComposeFile.mockImplementation(() => mockProcess(withJobs));
      render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByText("migrate")).toBeInTheDocument());
      expect(screen.getByText("nightly")).toBeInTheDocument();
      expect(screen.getByText(/Up does not start jobs/i)).toBeInTheDocument();
    });

    it("warns before confirming only while a scheduled job is active, following the profile selection", async () => {
      mockReadComposeFile.mockImplementation(() => mockProcess(withJobs));
      render(<UpConfirmModal stack={stack} onConfirm={vi.fn()} onClose={vi.fn()} />);
      await waitFor(() => screen.getByText("nightly"));
      // nightly is gated behind the "ops" profile, so it is inactive until that is ticked.
      expect(screen.queryByText(/will refuse to start this stack/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole("checkbox", { name: "ops" }));
      expect(screen.getByText(/will refuse to start this stack/i)).toBeInTheDocument();
      expect(screen.getByText(/active: nightly/i)).toBeInTheDocument();
      // It warns; it does not block. The CLI stays the authority.
      expect(screen.getByRole("button", { name: /^Up$/i })).toBeEnabled();
    });
  });
});
