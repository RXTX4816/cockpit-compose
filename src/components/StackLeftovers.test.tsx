import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { StackLeftoversPanel } from "./StackLeftovers";

const { mockPlan, mockRun } = vi.hoisted(() => ({ mockPlan: vi.fn(), mockRun: vi.fn() }));
vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, planDamagedRepair: mockPlan, runDamagedRepair: mockRun };
});

const LEFT = "a".repeat(64);
const GHOST = "b".repeat(64);
const plan = {
  rootless: true,
  dataRoot: "/home/test/.local/share/docker",
  commands: ["systemctl --user stop docker", `rm -rf /home/test/.local/share/docker/containers/${GHOST}`, "systemctl --user start docker"],
};

beforeEach(() => {
  mockPlan.mockReset().mockResolvedValue(plan);
  mockRun.mockReset().mockResolvedValue(undefined);
});

describe("StackLeftoversPanel", () => {
  it("names ordinary leftovers and offers a force remove", () => {
    const onForceRemove = vi.fn();
    render(<StackLeftoversPanel name="gotify" leftovers={{ ids: [LEFT], damaged: [] }} onForceRemove={onForceRemove} onRepaired={vi.fn()} />);
    expect(screen.getByText("Docker still lists containers for gotify")).toBeInTheDocument();
    expect(screen.getByText(LEFT.slice(0, 12))).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Force remove" }));
    expect(onForceRemove).toHaveBeenCalledOnce();
    expect(screen.queryByText(/damaged/i)).not.toBeInTheDocument();
  });

  it("explains a damaged record and shows the exact repair commands", async () => {
    render(<StackLeftoversPanel name="gotify" leftovers={{ ids: [GHOST], damaged: [GHOST] }} onRepaired={vi.fn()} />);
    expect(screen.getByText(/records for some of these containers are damaged/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByDisplayValue(/systemctl --user stop docker/)).toBeInTheDocument());
    expect(mockPlan).toHaveBeenCalledWith([GHOST], undefined);
    // Damaged records cannot be force removed, so that button is not offered for them.
    expect(screen.queryByRole("button", { name: "Force remove" })).not.toBeInTheDocument();
  });

  it("repairs only after a confirmation that warns about every container on the daemon", async () => {
    const onRepaired = vi.fn().mockResolvedValue(undefined);
    render(<StackLeftoversPanel name="gotify" leftovers={{ ids: [GHOST], damaged: [GHOST] }} onRepaired={onRepaired} />);
    fireEvent.click(await screen.findByRole("button", { name: "Repair" }));
    expect(mockRun).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Restart Docker to repair?" });
    expect(within(dialog).getByText(/every container on this Docker daemon stops/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Stop Docker and repair" }));
    await waitFor(() => expect(mockRun).toHaveBeenCalledWith(plan));
    await waitFor(() => expect(onRepaired).toHaveBeenCalledOnce());
  });

  it("does not repair when the confirmation is cancelled", async () => {
    render(<StackLeftoversPanel name="gotify" leftovers={{ ids: [GHOST], damaged: [GHOST] }} onRepaired={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Repair" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Restart Docker to repair?" })).getByRole("button", { name: "Cancel" }));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("shows why a repair failed", async () => {
    mockRun.mockRejectedValue(new Error("Interactive authentication required."));
    render(<StackLeftoversPanel name="gotify" leftovers={{ ids: [GHOST], damaged: [GHOST] }} onRepaired={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Repair" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop Docker and repair" }));
    expect(await screen.findByText("Interactive authentication required.")).toBeInTheDocument();
  });
});
