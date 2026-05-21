import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExecModal } from "./ExecModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

// Mock xterm so the test environment (jsdom) doesn't choke on canvas
vi.mock("@xterm/xterm", () => {
  class Terminal {
    loadAddon = vi.fn();
    open = vi.fn();
    write = vi.fn();
    onData = vi.fn();
    options: Record<string, unknown> = {};
    dispose = vi.fn();
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddon {
    fit = vi.fn();
  }
  return { FitAddon };
});

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/docker-compose.yml",
};

const composeYaml = `
services:
  web:
    image: nginx
  db:
    image: postgres
`;

const mockChannel = {
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
};

beforeEach(() => {
  mockSpawn.mockReset();
  vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
});

describe("ExecModal", () => {
  it("renders modal title with stack name", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Shell — myapp/i)).toBeInTheDocument();
  });

  it("shows config step by default", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Command/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open shell/i })).toBeInTheDocument();
  });

  it("populates service selector from compose YAML", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "web" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "db" })).toBeInTheDocument();
  });

  it("defaults shell to /bin/sh", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    const shellInput = screen.getByLabelText(/Command/i) as HTMLInputElement & { value: string };
    expect(shellInput.value).toBe("/bin/sh");
  });

  it("Open shell button is disabled when service is empty", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    // No services loaded (file returned nothing) and no manual input
    const btn = screen.getByRole("button", { name: /Open shell/i });
    expect(btn).toBeInTheDocument();
  });

  it("shows terminal step after clicking Open shell", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Disconnect/i })).toBeInTheDocument());
  });

  it("calls onClose when Cancel clicked on config step", () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onClose = vi.fn();
    render(<ExecModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
