import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HelpPopover } from "./HelpPopover";

describe("HelpPopover", () => {
  it("renders the trigger button", () => {
    render(<HelpPopover header="Help" body="Some help text" />);
    expect(screen.getByRole("button", { name: "Help" })).toBeInTheDocument();
  });

  it("uses aria-label prop when provided", () => {
    render(<HelpPopover header="Help" body="text" aria-label="Custom label" />);
    expect(screen.getByRole("button", { name: "Custom label" })).toBeInTheDocument();
  });

  it("shows popover body when button is clicked", () => {
    render(<HelpPopover header="Help" body="Some help text" />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByText("Some help text")).toBeInTheDocument();
  });

  it("hides popover when Escape is pressed", () => {
    render(<HelpPopover header="Help" body="Some help text" />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    expect(screen.getByText("Some help text")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Some help text")).not.toBeInTheDocument();
  });
});
