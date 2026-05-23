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

const images = JSON.stringify([
  {
    ID: "sha256:abc",
    Repository: "nginx",
    Tag: "latest",
    Size: 148897792,
    CreatedAt: "2026-01-01 00:00:00",
    ContainerName: "myapp_web_1",
  },
]);

const volumes = JSON.stringify([
  { Name: "myapp_data", Driver: "local", Mountpoint: "/var/lib/docker/volumes/myapp_data/_data" },
]);

function mockSpawnSequence(...responses: ReturnType<typeof mockProcess>[]) {
  let i = 0;
  mockSpawn.mockImplementation(() => responses[Math.min(i++, responses.length - 1)]);
}

describe("StackInfoModal", () => {
  it("renders modal title with stack name", () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/myapp — info/i)).toBeInTheDocument();
  });

  it("shows spinners while loading", () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0);
  });

  it("shows config file path", () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText("/path/docker-compose.yml")).toBeInTheDocument();
  });

  it("renders container info after loading", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getAllByText("nginx:latest").length).toBeGreaterThan(0);
    expect(screen.getByText(/Up 2 hours/i)).toBeInTheDocument();
  });

  it("shows truncated container ID (12 chars)", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("abc123def456")).toBeInTheDocument();
  });

  it("renders port label for mapped ports", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("0.0.0.0:8080 → 80/tcp")).toBeInTheDocument());
  });

  it("shows empty state when no containers returned", async () => {
    mockSpawnSequence(mockProcess("[]"), mockProcess("[]"), mockProcess("[]"));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No containers found/i)).toBeInTheDocument());
  });

  it("shows error alert on container fetch failure", async () => {
    mockSpawnSequence(mockProcess("", "permission denied"), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not load container info/i)).toBeInTheDocument());
  });

  it("renders images table after loading", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("nginx")).toBeInTheDocument();
    expect(screen.getByText("142.0MiB")).toBeInTheDocument();
  });

  it("shows images error alert on failure", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess("", "images failed"), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not load images/i)).toBeInTheDocument());
  });

  it("renders volumes table after loading", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess(volumes));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("myapp_data")).toBeInTheDocument();
    expect(screen.getByText("local")).toBeInTheDocument();
  });

  it("shows unavailable notice when docker compose volumes is not supported", async () => {
    mockSpawnSequence(mockProcess(containers), mockProcess(images), mockProcess("", "unknown command"));
    render(<StackInfoModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Not available on this Docker Compose version/i)).toBeInTheDocument());
  });
});
