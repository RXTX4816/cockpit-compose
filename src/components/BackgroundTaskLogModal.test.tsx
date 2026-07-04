import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { BackgroundTaskLogModal } from "./BackgroundTaskLogModal";
import type { BackgroundTask } from "../hooks/useBackgroundTasks";

const mockStop = vi.fn();
vi.mock("../hooks/useBackgroundTasks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../hooks/useBackgroundTasks")>();
  return { ...actual, useBackgroundTasks: () => ({ tasks: [], enqueue: vi.fn(), stop: mockStop, remove: vi.fn() }) };
});

const runningTask: BackgroundTask = {
  id: 1, stackName: "myapp", action: "up", label: "Up — myapp", status: "running", lines: ["line one"], createdAt: 0,
};

describe("BackgroundTaskLogModal", () => {
  it("renders the task label as the modal title and its lines", () => {
    render(<BackgroundTaskLogModal task={runningTask} onClose={vi.fn()} />);
    expect(screen.getByText("Up — myapp")).toBeInTheDocument();
    expect(screen.getByText("line one")).toBeInTheDocument();
  });

  it("shows a Stop button while running, which calls stop()", () => {
    render(<BackgroundTaskLogModal task={runningTask} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /^Stop$/i }));
    expect(mockStop).toHaveBeenCalledWith(1);
  });

  it("shows a Close button (not Stop) once finished", () => {
    const onClose = vi.fn();
    render(<BackgroundTaskLogModal task={{ ...runningTask, status: "success" }} onClose={onClose} />);
    expect(screen.queryByRole("button", { name: /^Stop$/i })).not.toBeInTheDocument();
    const closeButtons = screen.getAllByRole("button", { name: /Close/i });
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows the error message when the task failed", () => {
    render(<BackgroundTaskLogModal task={{ ...runningTask, status: "error", errorMsg: "boom" }} onClose={vi.fn()} />);
    expect(screen.getByText("boom")).toBeInTheDocument();
  });
});
