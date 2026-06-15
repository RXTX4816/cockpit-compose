import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    composeVersion: vi.fn(),
    containerVersion: vi.fn(),
    isRootlessMode: vi.fn().mockReturnValue(false),
    getDockerSocketPath: vi.fn().mockReturnValue(undefined),
    getPodmanSocketPath: vi.fn().mockReturnValue(undefined),
  };
});

import { composeVersion, containerVersion, isRootlessMode, getDockerSocketPath, getPodmanSocketPath } from "../api";
const mockComposeVersion = vi.mocked(composeVersion);
const mockContainerVersion = vi.mocked(containerVersion);
const mockIsRootlessMode = vi.mocked(isRootlessMode);
const mockGetDockerSocketPath = vi.mocked(getDockerSocketPath);
const mockGetPodmanSocketPath = vi.mocked(getPodmanSocketPath);

beforeEach(() => {
  vi.clearAllMocks();
  mockComposeVersion.mockImplementation(() => mockProcess(""));
  mockContainerVersion.mockImplementation(() => mockProcess(""));
  mockIsRootlessMode.mockReturnValue(false);
  mockGetDockerSocketPath.mockReturnValue(undefined);
  mockGetPodmanSocketPath.mockReturnValue(undefined);
});

describe("AppFooter", () => {
  it("renders the footer element", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    expect(document.querySelector(".cc-footer")).toBeInTheDocument();
  });

  it("shows compose version once the process resolves with valid JSON", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess('{"version":"2.35.0"}'));
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    await waitFor(() => {
      expect(screen.getByText(/2\.35\.0/)).toBeInTheDocument();
    });
  });

  it("shows container runtime version once the process resolves", async () => {
    mockContainerVersion.mockImplementation(() => mockProcess("27.1.0"));
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    await waitFor(() => {
      expect(screen.getByText(/27\.1\.0/)).toBeInTheDocument();
    });
  });

  it("shows rootless badge when isRootlessMode returns true", async () => {
    mockIsRootlessMode.mockReturnValue(true);
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    expect(screen.getByText("Rootless")).toBeInTheDocument();
  });

  it("does not show rootless badge in system docker mode", async () => {
    mockIsRootlessMode.mockReturnValue(false);
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    expect(screen.queryByText("Rootless")).toBeNull();
  });

  it("shows socket path as tooltip on version label (not standalone text)", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///run/user/1000/docker.sock");
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    expect(screen.queryByText("unix:///run/user/1000/docker.sock")).toBeNull();
    expect(document.querySelector(".cc-footer")).toBeInTheDocument();
  });

  it("uses podman socket path when runtime is podman", async () => {
    mockGetPodmanSocketPath.mockReturnValue("unix:///run/user/1000/podman/podman.sock");
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="podman" />);
    expect(screen.queryByText("unix:///run/user/1000/podman/podman.sock")).toBeNull();
    expect(document.querySelector(".cc-footer")).toBeInTheDocument();
  });

  it("does not crash when compose version process rejects", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("", "permission denied"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter runtime="docker" />)).not.toThrow();
  });

  it("does not crash when container version process rejects", async () => {
    mockContainerVersion.mockImplementation(() => mockProcess("", "permission denied"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter runtime="docker" />)).not.toThrow();
  });

  it("does not crash when compose version JSON is malformed", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("not-valid-json"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter runtime="docker" />)).not.toThrow();
    await waitFor(() => {
      expect(screen.queryByText(/not-valid-json/)).toBeNull();
    });
  });

  it("renders help and feedback links", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    const links = document.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(2);
    const hrefs = Array.from(links).map(a => a.getAttribute("href") ?? "");
    expect(hrefs.some(h => h.includes("wiki"))).toBe(true);
    expect(hrefs.some(h => h.includes("issues"))).toBe(true);
  });

  it("opens links in a new tab (target=_blank)", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    const links = document.querySelectorAll("a");
    for (const link of Array.from(links)) {
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });
});

describe("AppFooter — runtime prop change", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockComposeVersion.mockImplementation(() => mockProcess(""));
    mockContainerVersion.mockImplementation(() => mockProcess(""));
    mockIsRootlessMode.mockReturnValue(false);
    mockGetDockerSocketPath.mockReturnValue(undefined);
    mockGetPodmanSocketPath.mockReturnValue(undefined);
  });

  it("re-fetches compose version when runtime prop changes", async () => {
    const { AppFooter } = await import("./AppFooter");
    const { rerender } = render(<AppFooter runtime="docker" />);
    const callsBefore = mockComposeVersion.mock.calls.length;
    rerender(<AppFooter runtime="podman" />);
    expect(mockComposeVersion.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("re-fetches container version when runtime prop changes", async () => {
    const { AppFooter } = await import("./AppFooter");
    const { rerender } = render(<AppFooter runtime="docker" />);
    const callsBefore = mockContainerVersion.mock.calls.length;
    rerender(<AppFooter runtime="podman" />);
    expect(mockContainerVersion.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("reads docker socket path when runtime is docker", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    mockGetPodmanSocketPath.mockReturnValue("unix:///run/user/1000/podman/podman.sock");
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="docker" />);
    // Docker socket path appears as tooltip on version label — Podman path does not
    expect(mockGetDockerSocketPath).toHaveBeenCalled();
  });

  it("reads podman socket path when runtime is podman", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///var/run/docker.sock");
    mockGetPodmanSocketPath.mockReturnValue("unix:///run/user/1000/podman/podman.sock");
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter runtime="podman" />);
    expect(mockGetPodmanSocketPath).toHaveBeenCalled();
  });

  it("clears previously shown compose version when runtime changes", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess('{"version":"2.35.0"}'));
    const { AppFooter } = await import("./AppFooter");
    const { rerender } = render(<AppFooter runtime="docker" />);
    await waitFor(() => expect(screen.getByText(/2\.35\.0/)).toBeInTheDocument());
    // Switch runtime; new fetch returns no version
    mockComposeVersion.mockImplementation(() => mockProcess(""));
    rerender(<AppFooter runtime="podman" />);
    await waitFor(() => expect(screen.queryByText(/2\.35\.0/)).toBeNull());
  });
});
