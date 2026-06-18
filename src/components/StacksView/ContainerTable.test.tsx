import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContainerTable } from "./ContainerTable";
import type { ServiceActions } from "./ContainerTable";
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

function makeActions(overrides: Partial<ServiceActions> = {}): ServiceActions {
  return {
    actingService: null,
    onStart: vi.fn(),
    onStop: vi.fn(),
    onRestart: vi.fn(),
    onLogs: vi.fn(),
    ...overrides,
  };
}

describe("ContainerTable with actions", () => {
  it("renders Stop button for running service", () => {
    render(<ContainerTable containers={[runningContainer]} actions={makeActions()} />);
    expect(screen.getByLabelText("Stop service")).toBeInTheDocument();
  });

  it("renders Start button for stopped service", () => {
    render(<ContainerTable containers={[stoppedContainer]} actions={makeActions()} />);
    expect(screen.getByLabelText("Start service")).toBeInTheDocument();
  });

  it("renders Restart and Logs buttons for every service", () => {
    render(<ContainerTable containers={[runningContainer]} actions={makeActions()} />);
    expect(screen.getByLabelText("Restart service")).toBeInTheDocument();
    expect(screen.getByLabelText("Service logs")).toBeInTheDocument();
  });

  it("calls onStop with service name when Stop is clicked", () => {
    const actions = makeActions();
    render(<ContainerTable containers={[runningContainer]} actions={actions} />);
    fireEvent.click(screen.getByLabelText("Stop service"));
    expect(actions.onStop).toHaveBeenCalledWith("web");
  });

  it("calls onStart with service name when Start is clicked", () => {
    const actions = makeActions();
    render(<ContainerTable containers={[stoppedContainer]} actions={actions} />);
    fireEvent.click(screen.getByLabelText("Start service"));
    expect(actions.onStart).toHaveBeenCalledWith("db");
  });

  it("calls onRestart with service name when Restart is clicked", () => {
    const actions = makeActions();
    render(<ContainerTable containers={[runningContainer]} actions={actions} />);
    fireEvent.click(screen.getByLabelText("Restart service"));
    expect(actions.onRestart).toHaveBeenCalledWith("web");
  });

  it("calls onLogs with service name when Logs is clicked", () => {
    const actions = makeActions();
    render(<ContainerTable containers={[runningContainer]} actions={actions} />);
    fireEvent.click(screen.getByLabelText("Service logs"));
    expect(actions.onLogs).toHaveBeenCalledWith("web");
  });

  it("shows spinner and hides buttons for the acting service", () => {
    const actions = makeActions({ actingService: "web" });
    render(<ContainerTable containers={[runningContainer]} actions={actions} />);
    expect(screen.queryByLabelText("Stop service")).toBeNull();
    expect(document.querySelector(".pf-v6-c-spinner")).toBeInTheDocument();
  });

  it("does not render action buttons when actions prop is omitted", () => {
    render(<ContainerTable containers={[runningContainer]} />);
    expect(screen.queryByLabelText("Stop service")).toBeNull();
    expect(screen.queryByLabelText("Start service")).toBeNull();
  });
});

