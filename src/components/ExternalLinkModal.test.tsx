import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExternalLinkModal } from "./ExternalLinkModal";

describe("ExternalLinkModal", () => {
  it("renders the URL", () => {
    render(<ExternalLinkModal url="https://example.com:8080" onClose={vi.fn()} />);
    expect(screen.getByText("https://example.com:8080")).toBeInTheDocument();
  });

  it("calls onClose when cancel button clicked", () => {
    const onClose = vi.fn();
    render(<ExternalLinkModal url="https://example.com" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the URL in a new tab and calls onClose when continue is clicked", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const onClose = vi.fn();
    render(<ExternalLinkModal url="https://example.com" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank", "noopener,noreferrer");
    expect(onClose).toHaveBeenCalledOnce();
    openSpy.mockRestore();
  });
});
