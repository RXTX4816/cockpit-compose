import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, composeVersion: vi.fn() };
});

import { composeVersion } from "../api";
const mockComposeVersion = vi.mocked(composeVersion);

// Use mockImplementation so mockProcess is called fresh each time composeVersion() is called,
// ensuring the stream callback is registered before the microtask fires.
beforeEach(() => {
  vi.clearAllMocks();
  mockComposeVersion.mockImplementation(() => mockProcess(""));
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

  it("does not crash when compose version process rejects", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("", "permission denied"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter />)).not.toThrow();
  });

  it("does not crash when compose version JSON is malformed", async () => {
    mockComposeVersion.mockImplementation(() => mockProcess("not-valid-json"));
    const { AppFooter } = await import("./AppFooter");
    expect(() => render(<AppFooter />)).not.toThrow();
    // No compose version span should appear
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
