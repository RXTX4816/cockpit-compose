import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { YamlModal } from "./YamlModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

vi.mock("./YamlEditor", () => ({
  YamlEditor: ({ content }: { content: string }) => <textarea defaultValue={content} data-testid="yaml-editor" />,
}));

vi.mock("../hooks/useSnapshots", () => ({
  useSnapshots: vi.fn(),
}));

const mockCockpitFile = vi.fn();
beforeEach(() => {
  mockSpawn.mockReset();
  mockCockpitFile.mockReset().mockReturnValue({ replace: vi.fn().mockResolvedValue(undefined) });
  vi.stubGlobal("cockpit", { spawn: mockSpawn, file: mockCockpitFile });
});

import { useSnapshots } from "../hooks/useSnapshots";
const mockUseSnapshots = vi.mocked(useSnapshots);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

const composeContent = "services:\n  web:\n    image: nginx\n";

beforeEach(() => {
  mockUseSnapshots.mockReturnValue({
    snapshots: [],
    load: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn(),
    remove: vi.fn(),
  });
});

describe("YamlModal", () => {
  it("renders modal title with stack name", () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp — compose file/i)).toBeInTheDocument();
  });

  it("shows spinner while loading", () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("displays compose file content after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByTestId("yaml-editor")).toBeInTheDocument();
  });

  it("shows config file path", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("/path/compose.yml")).toBeInTheDocument());
  });

  it("shows error alert when compose file cannot be read", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "file not found"));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not read file/i)).toBeInTheDocument());
  });

  it("shows Edit button when not in edit mode", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument());
  });

  it("enters edit mode and shows Save/Cancel buttons on Edit click", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByRole("button", { name: /Save/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
  });

  it("Cancel reverts to read mode", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(screen.queryByRole("button", { name: /Save/i })).toBeNull();
  });

  it("shows snapshot History button when snapshots exist", async () => {
    mockUseSnapshots.mockReturnValue({
      snapshots: [{ timestamp: 1700000000000, name: "Jan 1 2024", path: "/path/compose.yml.snapshot.1700000000000" }],
      load: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn(),
      remove: vi.fn(),
    });
    mockSpawn.mockReturnValue(mockProcess(composeContent));
    render(<YamlModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /History/i })).toBeInTheDocument());
  });
});
