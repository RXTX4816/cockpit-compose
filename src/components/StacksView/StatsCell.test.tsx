import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatsCell } from "./StatsCell";

vi.mock("../../hooks/useContainerStats", () => ({
  useContainerStats: vi.fn(),
}));

import { useContainerStats } from "../../hooks/useContainerStats";
const mockUseContainerStats = vi.mocked(useContainerStats);

beforeEach(() => {
  mockUseContainerStats.mockReturnValue({ ports: [], stats: null });
});

describe("StatsCell", () => {
  it("renders dash for stopped status", () => {
    const { container } = render(<StatsCell stackName="myapp" status="stopped" />);
    expect(container.textContent).toBe("—");
  });

  it("renders dash for unknown status", () => {
    const { container } = render(<StatsCell stackName="myapp" status="unknown" />);
    expect(container.textContent).toBe("—");
  });

  it("shows spinner while loading (no ports and no stats)", () => {
    render(<StatsCell stackName="myapp" status="running" />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders port labels when ports are present", () => {
    mockUseContainerStats.mockReturnValue({
      ports: [
        { label: "8080→80", fullLabel: "0.0.0.0:8080 → 80/tcp", bindAddress: "0.0.0.0", hostPort: "8080", containerPort: "80", protocol: "tcp", bindType: "external" },
        { label: "443→443", fullLabel: "127.0.0.1:443 → 443/tcp", bindAddress: "127.0.0.1", hostPort: "443", containerPort: "443", protocol: "tcp", bindType: "localhost" },
      ],
      stats: null,
    });
    render(<StatsCell stackName="myapp" status="running" />);
    expect(screen.getByText("8080→80")).toBeInTheDocument();
    expect(screen.getByText("443→443")).toBeInTheDocument();
  });

  it("renders CPU and memory stats", () => {
    mockUseContainerStats.mockReturnValue({
      ports: [],
      stats: { cpu: 1.5, mem: 52428800 },
    });
    render(<StatsCell stackName="myapp" status="running" />);
    expect(screen.getByText(/CPU 1.5%/i)).toBeInTheDocument();
    expect(screen.getByText(/Mem/i)).toBeInTheDocument();
  });

  it("renders both ports and stats when available", () => {
    mockUseContainerStats.mockReturnValue({
      ports: [{ label: "8080→80", fullLabel: "0.0.0.0:8080 → 80/tcp", bindAddress: "0.0.0.0", hostPort: "8080", containerPort: "80", protocol: "tcp", bindType: "external" as const }],
      stats: { cpu: 0.2, mem: 10485760 },
    });
    render(<StatsCell stackName="myapp" status="partial" />);
    expect(screen.getByText("8080→80")).toBeInTheDocument();
    expect(screen.getByText(/CPU 0.2%/i)).toBeInTheDocument();
  });
});
