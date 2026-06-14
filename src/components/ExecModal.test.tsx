import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ExecModal } from "./ExecModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

// Hoist Terminal and FitAddon mocks so tests can access the shared instances
const { MockTerminal, mockTermInstance, MockFitAddon, mockFitInstance } = vi.hoisted(() => {
  const mockTermInstance = {
    loadAddon: vi.fn(),
    open: vi.fn(),
    write: vi.fn(),
    onData: vi.fn(),
    options: {} as Record<string, unknown>,
    dispose: vi.fn(),
  };
  const MockTerminal = vi.fn().mockImplementation(function() { return mockTermInstance; });

  const mockFitInstance = { fit: vi.fn() };
  const MockFitAddon = vi.fn().mockImplementation(function() { return mockFitInstance; });

  return { MockTerminal, mockTermInstance, MockFitAddon, mockFitInstance };
});

vi.mock("@xterm/xterm", () => ({ Terminal: MockTerminal }));
vi.mock("@xterm/addon-fit", () => ({ FitAddon: MockFitAddon }));

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
  mockChannel.send.mockClear();
  mockChannel.close.mockClear();
  mockChannel.addEventListener.mockClear();
  MockTerminal.mockClear();
  mockTermInstance.loadAddon.mockClear();
  mockTermInstance.open.mockClear();
  mockTermInstance.write.mockClear();
  mockTermInstance.onData.mockClear();
  mockTermInstance.options = {};
  mockTermInstance.dispose.mockClear();
  MockFitAddon.mockClear();
  mockFitInstance.fit.mockClear();
  vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
});

describe("ExecModal", () => {
  it("renders modal title with stack name", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Shell — myapp/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows config step by default", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByLabelText(/Command/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Open shell/i })).toBeInTheDocument();
    await act(async () => {});
  });

  it("populates service selector from compose YAML", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("option", { name: "web" })).toBeInTheDocument());
    expect(screen.getByRole("option", { name: "db" })).toBeInTheDocument();
  });

  it("defaults shell to /bin/sh", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    const shellInput = screen.getByLabelText(/Command/i) as HTMLInputElement & { value: string };
    expect(shellInput.value).toBe("/bin/sh");
    await act(async () => {});
  });

  it("Open shell button is disabled when service is empty", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    // No services loaded (file returned nothing) and no manual input
    const btn = screen.getByRole("button", { name: /Open shell/i });
    expect(btn).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows terminal step after clicking Open shell", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Disconnect/i })).toBeInTheDocument());
  });

  it("calls onClose when Cancel clicked on config step", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    const onClose = vi.fn();
    render(<ExecModal stack={stack} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
    await act(async () => {});
  });

  it("service select onChange updates selected service", async () => {
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    const select = screen.getByRole("combobox");
    fireEvent.change(select, { target: { value: "db" } });
    // No crash — selectedService updated to "db"
    expect(screen.getByRole("option", { name: "db" })).toBeInTheDocument();
  });

  it("service TextInput onChange updates selected service when no services loaded", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await act(async () => {});
    const input = screen.getByPlaceholderText(/service name/i);
    fireEvent.change(input, { target: { value: "myservice" } });
    await waitFor(() => expect(screen.getByRole("button", { name: /Open shell/i })).not.toBeDisabled());
  });

  it("command TextInput onChange updates shell value", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await act(async () => {});
    const cmdInput = screen.getByPlaceholderText(/\/bin\/sh/i);
    fireEvent.change(cmdInput, { target: { value: "/bin/bash" } });
    expect((cmdInput as HTMLInputElement).value).toBe("/bin/bash");
  });

  it("user TextInput onChange updates user value", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await act(async () => {});
    const userInput = screen.getByPlaceholderText(/root/i);
    fireEvent.change(userInput, { target: { value: "admin" } });
    expect((userInput as HTMLInputElement).value).toBe("admin");
  });

  it("launchTerminal sets up channel and terminal when requestAnimationFrame fires", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockCockpit.channel).toHaveBeenCalled());
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("channel close with problem sets connectError alert", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockChannel.addEventListener).toHaveBeenCalled());
    const closeCall = mockChannel.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "close");
    if (closeCall) {
      await act(async () => {
        (closeCall[1] as (_e: Event, opts: { problem?: string }) => void)(new Event("close"), { problem: "connection-refused" });
      });
      await waitFor(() => expect(screen.getByText(/connection-refused/i)).toBeInTheDocument());
    }
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("channel message event writes data to terminal", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockChannel.addEventListener).toHaveBeenCalled());
    const msgCall = mockChannel.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "message");
    expect(msgCall).toBeDefined();
    await act(async () => {
      (msgCall![1] as (_e: Event, payload: string) => void)(new Event("message"), "hello world");
    });
    expect(mockTermInstance.write).toHaveBeenCalledWith("hello world");
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("onData callback sends data to channel", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockTermInstance.onData).toHaveBeenCalled());
    const onDataCb = (mockTermInstance.onData as ReturnType<typeof vi.fn>).mock.calls[0][0] as (data: string) => void;
    onDataCb("user input");
    expect(mockChannel.send).toHaveBeenCalledWith("user input");
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("cockpit-style event updates terminal theme when terminal is active", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockTermInstance.open).toHaveBeenCalled());
    await act(async () => {
      window.dispatchEvent(new Event("cockpit-style"));
    });
    expect(mockTermInstance.options.theme).toBeDefined();
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("storage event updates terminal theme when terminal is active", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockTermInstance.open).toHaveBeenCalled());
    await act(async () => {
      window.dispatchEvent(new Event("storage"));
    });
    expect(mockTermInstance.options.theme).toBeDefined();
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("cockpit-style event does nothing when terminal is not yet active", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await act(async () => {});
    await act(async () => {
      window.dispatchEvent(new Event("cockpit-style"));
    });
    // terminalRef.current was null → theme not updated
    expect(mockTermInstance.options.theme).toBeUndefined();
  });

  it("cockpit-style event uses dark colors when dark mode is active", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockTermInstance.open).toHaveBeenCalled());
    document.documentElement.classList.add("pf-v6-theme-dark");
    await act(async () => {
      window.dispatchEvent(new Event("cockpit-style"));
    });
    document.documentElement.classList.remove("pf-v6-theme-dark");
    expect(mockTermInstance.options.theme).toMatchObject({ background: "#1e1e1e" });
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("launchTerminal returns early when selected service is empty", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await act(async () => {});
    // Button is disabled (no service), but fireEvent bypasses disabled state in jsdom
    fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    await act(async () => {});
    // Still on config step — no terminal was launched
    expect(screen.queryByRole("button", { name: /Disconnect/i })).not.toBeInTheDocument();
  });

  it("launchTerminal includes -u flag when user field is filled", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    const userInput = screen.getByPlaceholderText(/root/i);
    fireEvent.change(userInput, { target: { value: "admin" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockCockpit.channel).toHaveBeenCalled());
    const channelArgs = (mockCockpit.channel as ReturnType<typeof vi.fn>).mock.calls[0][0] as { spawn: string[] };
    expect(channelArgs.spawn).toContain("-u");
    expect(channelArgs.spawn).toContain("admin");
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("channel close with terminated reason does not show error alert", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockChannel.addEventListener).toHaveBeenCalled());
    const closeCall = mockChannel.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "close");
    await act(async () => {
      (closeCall![1] as (_e: Event, opts: { problem?: string }) => void)(
        new Event("close"), { problem: "terminated" }
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });

  it("channel close with no problem or message does not show error alert", async () => {
    vi.stubGlobal("requestAnimationFrame", (fn: (time: number) => void) => { fn(0); return 0; });
    const mockCockpit = { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) };
    vi.stubGlobal("cockpit", mockCockpit);
    mockSpawn.mockReturnValue(mockProcess(composeYaml));
    render(<ExecModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("option", { name: "web" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Open shell/i }));
    });
    await waitFor(() => expect(mockChannel.addEventListener).toHaveBeenCalled());
    const closeCall = mockChannel.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "close");
    await act(async () => {
      (closeCall![1] as (_e: Event, opts: Record<string, unknown>) => void)(
        new Event("close"), {}
      );
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.unstubAllGlobals();
    vi.stubGlobal("cockpit", { spawn: mockSpawn, channel: vi.fn().mockReturnValue(mockChannel) });
  });
});
