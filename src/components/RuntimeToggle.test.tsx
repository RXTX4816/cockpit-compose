import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RuntimeToggle } from "./RuntimeToggle";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    setRuntime: vi.fn(),
    detectComposeCommand: vi.fn(),
    getSocketMode: vi.fn(),
    setSocketMode: vi.fn(),
    getSocketAvailability: vi.fn(),
    redetectSockets: vi.fn(),
    checkSocketHealth: vi.fn(),
  };
});

import {
  setRuntime, detectComposeCommand, getSocketMode, setSocketMode, getSocketAvailability,
  redetectSockets, checkSocketHealth,
} from "../api";
const mockSetRuntime = vi.mocked(setRuntime);
const mockDetectComposeCommand = vi.mocked(detectComposeCommand);
const mockGetSocketMode = vi.mocked(getSocketMode);
const mockSetSocketMode = vi.mocked(setSocketMode);
const mockGetSocketAvailability = vi.mocked(getSocketAvailability);
const mockRedetectSockets = vi.mocked(redetectSockets);
const mockCheckSocketHealth = vi.mocked(checkSocketHealth);

const RUNTIME_KEY = "cockpit-compose:runtime";

describe("RuntimeToggle", () => {
  beforeEach(() => {
    localStorage.clear();
    mockSetRuntime.mockReset();
    mockDetectComposeCommand.mockReset();
    mockDetectComposeCommand.mockResolvedValue(true);
    // Realistic default: a fresh app load normally resolves *some* socket mode. Tests for the
    // "nothing detected at all" banner override this explicitly to avoid it firing everywhere.
    mockGetSocketMode.mockReset().mockReturnValue("rootless");
    mockSetSocketMode.mockReset();
    mockGetSocketAvailability.mockReset().mockReturnValue({ rootless: false, rootful: false, rootfulNeedsAdminAccess: false });
    mockRedetectSockets.mockReset().mockResolvedValue(undefined);
    mockCheckSocketHealth.mockReset().mockResolvedValue({ ok: true });
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

  describe("socket mode toggle", () => {
    it("is hidden when neither socket was detected", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: false, rootful: false, rootfulNeedsAdminAccess: false });
      render(<RuntimeToggle />);
      expect(screen.queryByRole("button", { name: /rootless/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /rootful/i })).not.toBeInTheDocument();
    });

    it("shows the toggle with rootful disabled and an admin-access hint when the rootful socket couldn't be confirmed", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: false, rootful: false, rootfulNeedsAdminAccess: true });
      render(<RuntimeToggle />);
      expect(screen.getByRole("button", { name: /rootful/i })).toBeDisabled();
    });

    it("shows a visible warning banner (not just a hover tooltip) when no socket could be confirmed at all", () => {
      mockGetSocketMode.mockReturnValue(undefined);
      mockGetSocketAvailability.mockReturnValue({ rootless: false, rootful: false, rootfulNeedsAdminAccess: false });
      render(<RuntimeToggle />);
      expect(screen.getByText(/no docker engine socket detected/i)).toBeInTheDocument();
    });

    it("shows an admin-access-specific banner when only the rootful socket needed confirmation", () => {
      mockGetSocketMode.mockReturnValue(undefined);
      mockGetSocketAvailability.mockReturnValue({ rootless: false, rootful: false, rootfulNeedsAdminAccess: true });
      render(<RuntimeToggle />);
      expect(screen.getByText(/requires cockpit's administrative access/i)).toBeInTheDocument();
    });

    it("does not show the no-socket banner once a mode is resolved", () => {
      mockGetSocketMode.mockReturnValue("rootless");
      render(<RuntimeToggle />);
      expect(screen.queryByText(/no docker engine socket detected/i)).not.toBeInTheDocument();
    });

    it("shows both options and marks the effective mode as selected", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: true, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      render(<RuntimeToggle />);
      expect(screen.getByRole("button", { name: /rootless/i })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: /rootful/i })).toHaveAttribute("aria-pressed", "false");
    });

    it("disables the unavailable option", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: false, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      render(<RuntimeToggle />);
      expect(screen.getByRole("button", { name: /rootful/i })).toBeDisabled();
      expect(screen.getByRole("button", { name: /rootless/i })).not.toBeDisabled();
    });

    it("persists the user's choice via setSocketMode when clicking an enabled option", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: true, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      render(<RuntimeToggle />);
      fireEvent.click(screen.getByRole("button", { name: /rootful/i }));
      expect(mockSetSocketMode).toHaveBeenCalledWith("docker", "rootful");
    });

    // The stacks list has no polling of its own — without this callback firing, switching modes
    // would keep showing whatever was fetched under the previous mode (e.g. a rootless-mode stack
    // list still showing after switching to Rootful) until some unrelated action refreshed it.
    it("calls onSocketModeChange when the mode is switched, so the stacks list can refresh", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: true, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      const onSocketModeChange = vi.fn();
      render(<RuntimeToggle onSocketModeChange={onSocketModeChange} />);
      fireEvent.click(screen.getByRole("button", { name: /rootful/i }));
      expect(onSocketModeChange).toHaveBeenCalledTimes(1);
    });

    it("does not call onSocketModeChange when clicking the already-active mode", () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: true, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      const onSocketModeChange = vi.fn();
      render(<RuntimeToggle onSocketModeChange={onSocketModeChange} />);
      fireEvent.click(screen.getByRole("button", { name: /rootless/i }));
      expect(onSocketModeChange).not.toHaveBeenCalled();
    });

    it("calls onSocketModeChange after a recheck resolves to a different mode", async () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: false, rootfulNeedsAdminAccess: false });
      // getSocketMode is called twice during mount (useState initializer + the resync effect) —
      // both must return "rootless" so local state settles there before recheck flips it.
      mockGetSocketMode.mockReturnValueOnce("rootless").mockReturnValueOnce("rootless").mockReturnValue("rootful");
      const onSocketModeChange = vi.fn();
      render(<RuntimeToggle onSocketModeChange={onSocketModeChange} />);
      fireEvent.click(screen.getByRole("button", { name: /recheck/i }));
      await waitFor(() => expect(onSocketModeChange).toHaveBeenCalledTimes(1));
    });

    it("recheck button re-detects sockets and health-checks available candidates", async () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: false, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      render(<RuntimeToggle />);
      fireEvent.click(screen.getByRole("button", { name: /recheck/i }));
      await waitFor(() => expect(mockRedetectSockets).toHaveBeenCalledWith("docker"));
      expect(mockCheckSocketHealth).toHaveBeenCalledWith("docker", "rootless");
      expect(mockCheckSocketHealth).not.toHaveBeenCalledWith("docker", "rootful");
    });

    it("disables an option whose health check reports unhealthy", async () => {
      mockGetSocketAvailability.mockReturnValue({ rootless: true, rootful: true, rootfulNeedsAdminAccess: false });
      mockGetSocketMode.mockReturnValue("rootless");
      mockCheckSocketHealth.mockImplementation((_runtime, mode) =>
        Promise.resolve(mode === "rootful" ? { ok: false, reason: "connection refused" } : { ok: true }),
      );
      render(<RuntimeToggle />);
      fireEvent.click(screen.getByRole("button", { name: /recheck/i }));
      await waitFor(() => expect(screen.getByRole("button", { name: /rootful/i })).toBeDisabled());
    });
  });
});
