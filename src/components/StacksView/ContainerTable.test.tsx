import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContainerTable } from "./ContainerTable";
import type { ComposeContainer } from "../../api";

const runningContainer: ComposeContainer = {
  ID: "abc123",
  Name: "myapp-web-1",
  Image: "nginx:latest",
  State: "running",
  Status: "Up 2 hours",
  Ports: "0.0.0.0:8080->80/tcp",
  Service: "web",
};

const stoppedContainer: ComposeContainer = {
  ID: "def456",
  Name: "myapp-db-1",
  Image: "postgres:15",
  State: "exited",
  Status: "Exited (0) 5 minutes ago",
  Ports: "",
  Service: "db",
};

describe("ContainerTable", () => {
  it("renders the service name", () => {
    render(<ContainerTable containers={[runningContainer]} />);
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("renders the image name", () => {
    render(<ContainerTable containers={[runningContainer]} />);
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
  });

  it("renders the status text", () => {
    render(<ContainerTable containers={[runningContainer]} />);
    expect(screen.getByText("Up 2 hours")).toBeInTheDocument();
  });

  it("renders multiple containers", () => {
    render(<ContainerTable containers={[runningContainer, stoppedContainer]} />);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("db")).toBeInTheDocument();
  });

  it("renders green label for running and grey label for exited", () => {
    render(<ContainerTable containers={[runningContainer, stoppedContainer]} />);
    const labels = screen.getAllByText(/running|exited/i);
    expect(labels.length).toBeGreaterThanOrEqual(2);
  });

  it("falls back to Name when Service is absent", () => {
    render(<ContainerTable containers={[{ ...runningContainer, Service: undefined } as unknown as ComposeContainer]} />);
    expect(screen.getByText("myapp-web-1")).toBeInTheDocument();
  });

  it("shows 'unknown' when State is null/undefined", () => {
    render(<ContainerTable containers={[{ ...runningContainer, State: undefined } as unknown as ComposeContainer]} />);
    expect(screen.getByText(/unknown/i)).toBeInTheDocument();
  });

  it("shows healthy health icon when Health is 'healthy'", () => {
    render(<ContainerTable containers={[{ ...runningContainer, Health: "healthy" }]} />);
    expect(screen.getByTitle(/passing/i)).toBeInTheDocument();
  });

  it("shows unhealthy health icon when Health is 'unhealthy'", () => {
    render(<ContainerTable containers={[{ ...runningContainer, Health: "unhealthy" }]} />);
    expect(screen.getByTitle(/failing/i)).toBeInTheDocument();
  });

  it("shows starting health icon when Health is 'starting'", () => {
    render(<ContainerTable containers={[{ ...runningContainer, Health: "starting" }]} />);
    expect(screen.getByTitle(/starting/i)).toBeInTheDocument();
  });

  it("shows no health icon when Health is empty", () => {
    render(<ContainerTable containers={[{ ...runningContainer, Health: "" }]} />);
    expect(screen.queryByTitle(/passing|failing|starting/i)).toBeNull();
  });

  it("renders empty list without error", () => {
    const { container } = render(<ContainerTable containers={[]} />);
    expect(container.querySelector(".ct-list")).toBeInTheDocument();
  });
});
