import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusLabel } from "./StatusLabel";

describe("StatusLabel", () => {
  it("renders running status", () => {
    render(<StatusLabel status="running" />);
    expect(screen.getByText(/running/i)).toBeInTheDocument();
  });

  it("renders stopped status", () => {
    render(<StatusLabel status="stopped" />);
    expect(screen.getByText(/stopped/i)).toBeInTheDocument();
  });

  it("renders partial status", () => {
    render(<StatusLabel status="partial" />);
    expect(screen.getByText(/partial/i)).toBeInTheDocument();
  });

  it("renders paused status", () => {
    render(<StatusLabel status="paused" />);
    expect(screen.getByText(/paused/i)).toBeInTheDocument();
  });

  it("renders unknown status", () => {
    render(<StatusLabel status="unknown" />);
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
  });
});
