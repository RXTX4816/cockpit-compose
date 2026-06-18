import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RuntimeToggle } from "./RuntimeToggle";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    setRuntime: vi.fn(),
    detectComposeCommand: vi.fn(),
  };
});

import { setRuntime, detectComposeCommand } from "../api";
const mockSetRuntime = vi.mocked(setRuntime);
const mockDetectComposeCommand = vi.mocked(detectComposeCommand);

const RUNTIME_KEY = "cockpit-compose:runtime";

describe("RuntimeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSetRuntime.mockReset();
    mockDetectComposeCommand.mockReset();
    mockDetectComposeCommand.mockResolvedValue(true);
  });

  it("renders Docker and Podman options", () => {
    render(<RuntimeToggle />);
    expect(screen.getByText(/docker/i)).toBeInTheDocument();
    expect(screen.getByText(/podman/i)).toBeInTheDocument();
  });

  it("shows Docker as selected by default", () => {
    render(<RuntimeToggle />);
    const dockerBtn = screen.getByRole("button", { name: /docker/i });
    expect(dockerBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("loads runtime from localStorage when set to podman", () => {
    localStorage.setItem(RUNTIME_KEY, "podman");
    render(<RuntimeToggle />);
    const podmanBtn = screen.getByRole("button", { name: /podman/i });
    expect(podmanBtn).toHaveAttribute("aria-pressed", "true");
  });

  it("shows confirm modal when Podman is clicked", () => {
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /podman/i }));
    expect(screen.getByText(/switch to podman/i)).toBeInTheDocument();
  });

  it("switches to Docker when Docker is clicked while on Podman", async () => {
    localStorage.setItem(RUNTIME_KEY, "podman");
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /docker/i }));
    await waitFor(() => expect(mockDetectComposeCommand).toHaveBeenCalled());
    expect(localStorage.getItem(RUNTIME_KEY)).toBe("docker");
  });

  it("shows not-installed alert when command is not found", async () => {
    localStorage.setItem(RUNTIME_KEY, "podman");
    mockDetectComposeCommand.mockResolvedValue(false);
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /docker/i }));
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeInTheDocument());
  });

  it("closes podman confirm modal when cancel is clicked", () => {
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /podman/i }));
    expect(screen.getByText(/switch to podman/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/switch to podman/i)).not.toBeInTheDocument();
  });

  it("closes podman confirm modal when modal X is clicked", () => {
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /podman/i }));
    expect(screen.getByText(/switch to podman/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/switch to podman/i)).not.toBeInTheDocument();
  });

  it("switches to podman and closes modal when Continue is clicked in confirm modal", async () => {
    render(<RuntimeToggle />);
    fireEvent.click(screen.getByRole("button", { name: /podman/i }));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(mockDetectComposeCommand).toHaveBeenCalled());
    expect(screen.queryByText(/switch to podman/i)).not.toBeInTheDocument();
  });

  it("shows info alert in confirm modal when suggestPodman is true", () => {
    render(<RuntimeToggle suggestPodman />);
    expect(screen.getByText(/not found on this system/i)).toBeInTheDocument();
  });
});
