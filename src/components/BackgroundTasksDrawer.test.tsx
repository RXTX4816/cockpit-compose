import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackgroundTasksDrawer } from "./BackgroundTasksDrawer";
import type { BackgroundTask } from "../hooks/useBackgroundTasks";

const mockStop = vi.fn();
const mockRemove = vi.fn();
let mockTasks: BackgroundTask[] = [];

vi.mock("../hooks/useBackgroundTasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useBackgroundTasks")>();
  return {
    ...actual,
    useBackgroundTasks: () => ({ tasks: mockTasks, enqueue: vi.fn(), stop: mockStop, remove: mockRemove }),
  };
});

beforeEach(() => {
  mockTasks = [];
  mockStop.mockReset();
  mockRemove.mockReset();
});

describe("BackgroundTasksDrawer", () => {
  it("renders a toggle button with no badge when there are no active tasks", () => {
    render(<BackgroundTasksDrawer />);
    expect(screen.getByRole("button", { name: /Background tasks/i })).toBeInTheDocument();
    expect(screen.queryByText("1")).not.toBeInTheDocument();
  });

  it("shows a badge count of pending/running tasks", () => {
    mockTasks = [
      { id: 1, stackName: "a", action: "up", label: "Up a", status: "running", lines: [], createdAt: 0 },
      { id: 2, stackName: "b", action: "pull", label: "Pull b", status: "pending", lines: [], createdAt: 0 },
      { id: 3, stackName: "c", action: "up", label: "Up c", status: "success", lines: [], createdAt: 0 },
    ];
    render(<BackgroundTasksDrawer />);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("panel is closed by default and opens on toggle click", () => {
    mockTasks = [{ id: 1, stackName: "a", action: "up", label: "Up a", status: "running", lines: [], createdAt: 0 }];
    render(<BackgroundTasksDrawer />);
    expect(screen.queryByText("Up a")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    expect(screen.getByText("Up a")).toBeInTheDocument();
  });

  it("shows an empty state when there are no tasks", () => {
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    expect(screen.getByText(/No background tasks/i)).toBeInTheDocument();
  });

  it("shows a Stop button for a running task and calls stop() on click", () => {
    mockTasks = [{ id: 1, stackName: "a", action: "up", label: "Up a", status: "running", lines: [], createdAt: 0 }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Stop$/i }));
    expect(mockStop).toHaveBeenCalledWith(1);
  });

  it("shows a Remove button (not Stop) for a finished task and calls remove() on click", () => {
    mockTasks = [{ id: 2, stackName: "b", action: "pull", label: "Pull b", status: "success", lines: [], createdAt: 0 }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    expect(screen.queryByRole("button", { name: /^Stop$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Remove$/i }));
    expect(mockRemove).toHaveBeenCalledWith(2);
  });

  it("shows the error message for a failed task", () => {
    mockTasks = [{
      id: 3, stackName: "c", action: "up", label: "Up c", status: "error", errorMsg: "boom", lines: [], createdAt: 0,
    }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    expect(screen.getByText("boom")).toBeInTheDocument();
  });

  it("clicking a running task's row reopens its log modal", () => {
    mockTasks = [{
      id: 1, stackName: "a", action: "up", label: "Up a", status: "running",
      lines: ["Container a-web-1  Starting"], createdAt: 0,
    }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    fireEvent.click(screen.getByText("Up a"));
    expect(screen.getByText(/Container a-web-1/)).toBeInTheDocument();
  });

  it("clicking Stop on a running row does not also reopen its log modal", () => {
    mockTasks = [{ id: 1, stackName: "a", action: "up", label: "Up a", status: "running", lines: [], createdAt: 0 }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Stop$/i }));
    expect(mockStop).toHaveBeenCalledWith(1);
    expect(screen.queryByText(/Waiting for output/i)).not.toBeInTheDocument();
  });

  it("clicking a finished task's row does not reopen a modal", () => {
    mockTasks = [{ id: 2, stackName: "b", action: "pull", label: "Pull b", status: "success", lines: [], createdAt: 0 }];
    render(<BackgroundTasksDrawer />);
    fireEvent.click(screen.getByRole("button", { name: /Background tasks/i }));
    fireEvent.click(screen.getByText("Pull b"));
    expect(screen.queryByText(/Waiting for output/i)).not.toBeInTheDocument();
  });
});
