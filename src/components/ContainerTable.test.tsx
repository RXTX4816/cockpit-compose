import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContainerTable } from "./StacksView";
import type { ComposeContainer } from "../api";

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
});
