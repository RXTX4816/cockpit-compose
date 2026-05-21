import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { StackInfoModal } from "./StackInfoModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

beforeEach(() => { mockSpawn.mockReset(); });

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/docker-compose.yml",
};

const containers = JSON.stringify([
  {
    ID: "abc123def456",
    Name: "myapp_web_1",
    Image: "nginx:latest",
    State: "running",
    Status: "Up 2 hours",
    Ports: "0.0.0.0:8080->80/tcp",
    Service: "web",
  },
]);

describe("StackInfoModal", () => {
  it("renders modal title with stack name", () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp — info/i)).toBeInTheDocument();
  });

  it("shows spinner while loading", () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows config file path", () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText("/path/docker-compose.yml")).toBeInTheDocument();
  });

  it("renders container info after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("nginx:latest")).toBeInTheDocument();
    expect(screen.getByText(/Up 2 hours/i)).toBeInTheDocument();
  });

  it("shows truncated container ID (12 chars)", async () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("abc123def456")).toBeInTheDocument();
  });

  it("renders port label for mapped ports", async () => {
    mockSpawn.mockReturnValue(mockProcess(containers));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("8080→80")).toBeInTheDocument());
  });

  it("shows empty state when no containers returned", async () => {
    mockSpawn.mockReturnValue(mockProcess("[]"));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No containers found/i)).toBeInTheDocument());
  });

  it("shows error alert on fetch failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not load container info/i)).toBeInTheDocument());
  });
});
