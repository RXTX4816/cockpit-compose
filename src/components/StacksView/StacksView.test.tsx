import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StacksView } from ".";

// Mock the hook so component tests don't depend on cockpit.spawn
vi.mock("../../hooks/useComposeStacks", () => ({
  useComposeStacks: vi.fn(),
}));

import { useComposeStacks } from "../../hooks/useComposeStacks";
const mockUseComposeStacks = vi.mocked(useComposeStacks);

const noopRefresh = vi.fn();

beforeEach(() => {
  noopRefresh.mockReset();
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
    // PatternFly spinner has role="progressbar"
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
  });
});
