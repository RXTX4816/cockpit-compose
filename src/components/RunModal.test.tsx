import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RunModal } from "./RunModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

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

beforeEach(() => {
  mockSpawn.mockReset();
});

describe("RunModal", () => {
  describe("config step", () => {
    it("renders modal title with stack name", async () => {
      mockSpawn.mockReturnValue(mockProcess(""));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      expect(screen.getByText(/Run — myapp/i)).toBeInTheDocument();
      await act(async () => {});
    });

    it("shows service field, command field, --rm checkbox, and Run button", async () => {
      mockSpawn.mockReturnValue(mockProcess(""));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      expect(screen.getByLabelText(/Command/i)).toBeInTheDocument();
      expect(screen.getByRole("checkbox")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Run$/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
      await act(async () => {});
    });

    it("--rm checkbox is checked by default", async () => {
      mockSpawn.mockReturnValue(mockProcess(""));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      await act(async () => {});
    });

    it("populates service selector from compose YAML", async () => {
      mockSpawn.mockReturnValue(mockProcess(composeYaml));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByRole("option", { name: "web" })).toBeInTheDocument());
      expect(screen.getByRole("option", { name: "db" })).toBeInTheDocument();
    });

    it("Run button is disabled when command is empty", async () => {
      mockSpawn.mockReturnValue(mockProcess(composeYaml));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => screen.getByRole("option", { name: "web" }));
      expect(screen.getByRole("button", { name: /^Run$/i })).toBeDisabled();
    });

    it("Run button is enabled once service and command are filled", async () => {
      mockSpawn.mockReturnValue(mockProcess(composeYaml));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => screen.getByRole("option", { name: "web" }));
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Command/i), { target: { value: "echo hello" } });
      });
      expect(screen.getByRole("button", { name: /^Run$/i })).not.toBeDisabled();
    });

    it("calls onClose when Cancel clicked", async () => {
      mockSpawn.mockReturnValue(mockProcess(""));
      const onClose = vi.fn();
      render(<RunModal stack={stack} onClose={onClose} />);
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
      expect(onClose).toHaveBeenCalledOnce();
      await act(async () => {});
    });

    it("uses first ConfigFile from comma-separated list", async () => {
      const multiStack: ComposeStack = { ...stack, ConfigFiles: "/a.yml, /b.yml" };
      mockSpawn.mockReturnValue(mockProcess(""));
      render(<RunModal stack={multiStack} onClose={vi.fn()} />);
      await act(async () => {});
      expect(mockSpawn.mock.calls[0][0]).toContain("/a.yml");
    });

    it("changing service selection updates the selected service", async () => {
      mockSpawn.mockReturnValue(mockProcess(composeYaml));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => screen.getByRole("option", { name: "db" }));
      fireEvent.change(screen.getByRole("combobox"), { target: { value: "db" } });
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select.value).toBe("db");
    });

    it("shows text input for service when no services found in compose file", async () => {
      mockSpawn.mockReturnValue(mockProcess("services: {}"));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => expect(screen.getByRole("textbox", { name: /service/i })).toBeInTheDocument());
      fireEvent.change(screen.getByRole("textbox", { name: /service/i }), { target: { value: "myservice" } });
      const input = screen.getByRole("textbox", { name: /service/i }) as HTMLInputElement;
      expect(input.value).toBe("myservice");
    });
  });

  describe("running step", () => {
    // Clicks Run and awaits full process completion. Four act() passes are needed:
    // 1) flush the command input state update; 2) fire click + flush handleRun
    // continuation (composeFileSuperuser + spawn); 3) flush the stream callback's
    // setLines update; 4) flush setDone which arrives one microtask after the stream.
    //
    // The run process mock must be created lazily (mockImplementationOnce) so that its
    // internal queueMicrotask fires *after* proc.stream(cb) has registered streamCb.
    // Eager creation (mockReturnValueOnce) schedules the microtask during initial mount
    // before streamCb is set, so the stream callback never fires.
    async function clickRun(onClose = vi.fn(), runOutput = "", runError?: string) {
      mockSpawn
        .mockReturnValueOnce(mockProcess(composeYaml))
        .mockReturnValueOnce(mockProcess("")) // snapshotProjectContainerIds
        .mockImplementationOnce(() => mockProcess(runOutput, runError));
      render(<RunModal stack={stack} onClose={onClose} />);
      await waitFor(() => screen.getByRole("option", { name: "web" }));
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Command/i), { target: { value: "echo hello" } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^Run$/i }));
      });
      await act(async () => {}); // flush setLines (stream data)
      await act(async () => {}); // flush setDone (arrives one microtask later)
    }

    it("transitions away from config step after clicking Run", async () => {
      await clickRun();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("shows success state after command completes", async () => {
      await clickRun();
      expect(screen.getByText(/Command complete/i)).toBeInTheDocument();
    });

    it("shows Close button (primary) in done state", async () => {
      await clickRun();
      const closeButtons = screen.getAllByRole("button", { name: /Close/i });
      expect(closeButtons.some(b => b.classList.contains("pf-m-primary"))).toBe(true);
    });

    it("calls onClose when Close button clicked in done state", async () => {
      const onClose = vi.fn();
      await clickRun(onClose);
      const primaryClose = screen.getAllByRole("button", { name: /Close/i })
        .find(b => b.classList.contains("pf-m-primary"))!;
      fireEvent.click(primaryClose);
      expect(onClose).toHaveBeenCalledOnce();
    });

    it("shows failure state and error message on error", async () => {
      await clickRun(vi.fn(), "", "container exited with code 1");
      expect(screen.getByText(/Command failed/i)).toBeInTheDocument();
      expect(screen.getByText(/container exited with code 1/i)).toBeInTheDocument();
    });

    it("renders output lines from command", async () => {
      await clickRun(vi.fn(), "hello world\n");
      expect(screen.getByText("hello world")).toBeInTheDocument();
    });
  });

  describe("compose run command", () => {
    async function triggerRun(rm: boolean) {
      mockSpawn
        .mockReturnValueOnce(mockProcess(composeYaml))
        .mockReturnValueOnce(mockProcess("")) // snapshotProjectContainerIds
        .mockReturnValueOnce(mockProcess(""));
      render(<RunModal stack={stack} onClose={vi.fn()} />);
      await waitFor(() => screen.getByRole("option", { name: "web" }));
      if (!rm) {
        await act(async () => { fireEvent.click(screen.getByRole("checkbox")); });
      }
      await act(async () => {
        fireEvent.change(screen.getByLabelText(/Command/i), { target: { value: "echo hello" } });
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /^Run$/i }));
      });
    }

    it("spawns docker compose run with --rm when checkbox is checked", async () => {
      await triggerRun(true);
      const args = mockSpawn.mock.calls[2][0] as string[];
      expect(args).toContain("run");
      expect(args).toContain("--rm");
      expect(args).toContain("web");
      expect(args).toContain("echo");
      expect(args).toContain("hello");
    });

    it("omits --rm when checkbox is unchecked", async () => {
      await triggerRun(false);
      const args = mockSpawn.mock.calls[2][0] as string[];
      expect(args).toContain("run");
      expect(args).not.toContain("--rm");
    });

    it("passes project, config file, and merges stderr into stdout", async () => {
      await triggerRun(true);
      const [args, opts] = mockSpawn.mock.calls[2] as [string[], Record<string, unknown>];
      expect(args).toContain("-p");
      expect(args).toContain("myapp");
      expect(args).toContain("-f");
      expect(args).toContain("/path/docker-compose.yml");
      expect(opts.err).toBe("out");
    });
  });
});
