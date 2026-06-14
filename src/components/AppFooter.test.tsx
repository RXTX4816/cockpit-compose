import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    composeVersion: vi.fn(),
    dockerVersion: vi.fn(),
    isRootlessMode: vi.fn().mockReturnValue(false),
    getDockerSocketPath: vi.fn().mockReturnValue(undefined),
  };
});

import { composeVersion, dockerVersion, isRootlessMode, getDockerSocketPath } from "../api";
const mockComposeVersion = vi.mocked(composeVersion);
const mockDockerVersion = vi.mocked(dockerVersion);
const mockIsRootlessMode = vi.mocked(isRootlessMode);
const mockGetDockerSocketPath = vi.mocked(getDockerSocketPath);

beforeEach(() => {
  vi.clearAllMocks();
  mockComposeVersion.mockImplementation(() => mockProcess(""));
  mockDockerVersion.mockImplementation(() => mockProcess(""));
  mockIsRootlessMode.mockReturnValue(false);
  mockGetDockerSocketPath.mockReturnValue(undefined);
});

describe("AppFooter", () => {
  it("renders the footer element", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    expect(document.querySelector(".cc-footer")).toBeInTheDocument();
  });

  it("shows compose version once the process resolves with valid JSON", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess('{"version":"2.35.0"}'));
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    await waitFor(() => {
      expect(screen.getByText(/2\.35\.0/)).toBeInTheDocument();
    });
  });

  it("shows docker version once the process resolves", async () => {
    mockDockerVersion.mockImplementation(() => mockProcess("27.1.0"));
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    await waitFor(() => {
      expect(screen.getByText(/27\.1\.0/)).toBeInTheDocument();
    });
  });

  it("shows rootless badge when isRootlessMode returns true", async () => {
    mockIsRootlessMode.mockReturnValue(true);
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    expect(screen.getByText("Rootless Docker")).toBeInTheDocument();
  });

  it("does not show rootless badge in system docker mode", async () => {
    mockIsRootlessMode.mockReturnValue(false);
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    expect(screen.queryByText("Rootless Docker")).toBeNull();
  });

  it("shows socket path as tooltip on version label (not standalone text)", async () => {
    mockGetDockerSocketPath.mockReturnValue("unix:///run/user/1000/docker.sock");
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    // Socket path is now a tooltip on the version label, not a visible standalone label
    expect(screen.queryByText("unix:///run/user/1000/docker.sock")).toBeNull();
    expect(document.querySelector(".cc-footer")).toBeInTheDocument();
  });

  it("does not crash when compose version process rejects", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("", "permission denied"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter />)).not.toThrow();
  });

  it("does not crash when docker version process rejects", async () => {
    mockDockerVersion.mockImplementation(() => mockProcess("", "permission denied"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter />)).not.toThrow();
  });

  it("does not crash when compose version JSON is malformed", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("not-valid-json"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter />)).not.toThrow();
    await waitFor(() => {
      expect(screen.queryByText(/not-valid-json/)).toBeNull();
    });
  });

  it("renders help and feedback links", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    const links = document.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(2);
    const hrefs = Array.from(links).map(a => a.getAttribute("href") ?? "");
    expect(hrefs.some(h => h.includes("wiki"))).toBe(true);
    expect(hrefs.some(h => h.includes("issues"))).toBe(true);
  });

  it("opens links in a new tab (target=_blank)", async () => {
    const { AppFooter } = await import("./AppFooter");
    render(<AppFooter />);
    const links = document.querySelectorAll("a");
    for (const link of Array.from(links)) {
      expect(link.getAttribute("target")).toBe("_blank");
    }
  });
});
