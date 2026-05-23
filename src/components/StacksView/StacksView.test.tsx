import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { StacksView } from ".";

vi.mock("../../hooks/useComposeStacks", () => ({
  useComposeStacks: vi.fn(),
}));
vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("./StatsCell", () => ({
  StatsCell: () => <span>StatsCell</span>,
}));
vi.mock("../LogsModal", () => ({
  LogsModal: ({ stack }: { stack: { Name: string } }) => <div data-testid="logs-modal">LogsModal:{stack.Name}</div>,
}));
vi.mock("../YamlModal", () => ({
  YamlModal: ({ stack }: { stack: { Name: string } }) => <div data-testid="yaml-modal">YamlModal:{stack.Name}</div>,
}));
vi.mock("../StackInfoModal", () => ({
  StackInfoModal: ({ stack }: { stack: { Name: string } }) => <div data-testid="info-modal">InfoModal:{stack.Name}</div>,
}));
vi.mock("../PullModal", () => ({
  PullModal: ({ stack }: { stack: { Name: string } }) => <div data-testid="pull-modal">PullModal:{stack.Name}</div>,
}));
vi.mock("../PullConfirmModal", () => ({
  PullConfirmModal: ({ stack, onConfirm }: { stack: { Name: string }; onConfirm: () => void }) => (
    <div data-testid="pull-confirm-modal">
      PullConfirmModal:{stack.Name}
      <button onClick={onConfirm}>Confirm pull</button>
    </div>
  ),
}));
vi.mock("../PruneModal", () => ({
  PruneModal: ({ stack }: { stack: { Name: string } }) => (
    <div data-testid="prune-modal">PruneModal:{stack.Name}</div>
  ),
}));
vi.mock("../DownedStacksSection", () => ({
  DownedStacksSection: () => <div data-testid="downed-stacks-section" />,
}));

import { useComposeStacks } from "../../hooks/useComposeStacks";
import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
const mockUseComposeStacks = vi.mocked(useComposeStacks);
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseStackContainers = vi.mocked(useStackContainers);

const noopRefresh = vi.fn();

beforeEach(() => {
  noopRefresh.mockReset();
  mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction: vi.fn() });
  mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: vi.fn(), clear: vi.fn() });
});

describe("StacksView", () => {
  it("shows a spinner while loading", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [],
      loading: true,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows empty state when no stacks found", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByText(/No compose stacks found/i)).toBeInTheDocument();
  });

  it("renders stack names when stacks are present", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [
        { Name: "myapp", Status: "running(2)", ConfigFiles: "/home/user/myapp/docker-compose.yml" },
        { Name: "database", Status: "running(1)", ConfigFiles: "/srv/db/compose.yml" },
      ],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
    expect(screen.getByText("database")).toBeInTheDocument();
  });

  it("shows error alert when error is set", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [],
      loading: false,
      error: "Docker daemon not responding",
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByText(/Failed to load stacks/i)).toBeInTheDocument();
    expect(screen.getByText(/Docker daemon not responding/i)).toBeInTheDocument();
  });

  it("renders action buttons for each stack", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [
        { Name: "myapp", Status: "running(1)", ConfigFiles: "/home/user/myapp/docker-compose.yml" },
      ],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByText("↑ Up")).toBeInTheDocument();
    expect(screen.getByText("Logs")).toBeInTheDocument();
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("↓ Down")).toBeInTheDocument();
  });

  it("Retry button in error alert calls refresh", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [],
      loading: false,
      error: "Docker daemon not responding",
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /Retry/i }));
    expect(noopRefresh).toHaveBeenCalledOnce();
  });

  it("toggle button expands a stack row", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    const toggleBtn = document.getElementById("toggle-myapp")!;
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggleBtn);
    expect(toggleBtn.getAttribute("aria-expanded")).toBe("true");
  });

  it("Down confirmation modal opens when ↓ Down is clicked", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /↓ Down/i }));
    expect(screen.getByText(/Remove "myapp"/i)).toBeInTheDocument();
  });

  it("Down modal Cancel button closes the modal", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /↓ Down/i }));
    expect(screen.getByText(/Remove "myapp"/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByText(/Remove "myapp"/i)).toBeNull();
  });

  it("Logs button opens LogsModal", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /Logs/i }));
    expect(screen.getByTestId("logs-modal")).toBeInTheDocument();
  });

  it("Edit button opens YamlModal", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(screen.getByTestId("yaml-modal")).toBeInTheDocument();
  });

  it("Info button opens StackInfoModal", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /Info/i }));
    expect(screen.getByTestId("info-modal")).toBeInTheDocument();
  });

  it("Pull latest images opens confirm modal first, then PullModal on confirm", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /^Pull$/i }));
    expect(screen.getByTestId("pull-confirm-modal")).toBeInTheDocument();
    expect(screen.queryByTestId("pull-modal")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Confirm pull/i }));
    expect(screen.getByTestId("pull-modal")).toBeInTheDocument();
  });

  it("Prune item opens PruneModal", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /More actions for myapp/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /^Prune$/i }));
    expect(screen.getByTestId("prune-modal")).toBeInTheDocument();
    expect(screen.getByText(/PruneModal:myapp/i)).toBeInTheDocument();
  });

  it("renders DownedStacksSection", () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    render(<StacksView />);
    expect(screen.getByTestId("downed-stacks-section")).toBeInTheDocument();
  });

  it("Down modal Down button calls performDown", async () => {
    mockUseComposeStacks.mockReturnValue({
      stacks: [{ Name: "myapp", Status: "running(1)", ConfigFiles: "/path/compose.yml" }],
      loading: false,
      error: null,
      refresh: noopRefresh,
    });
    const { mockSpawn } = await import("../../test/setup");
    const { mockProcess } = await import("../../test/helpers");
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<StacksView />);
    fireEvent.click(screen.getByRole("button", { name: /↓ Down/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Down \(remove\)$/i }));
    // downStack is now called asynchronously (after composeFileSuperuser resolves).
    await waitFor(() => expect(mockSpawn).toHaveBeenCalled());
  });
});
