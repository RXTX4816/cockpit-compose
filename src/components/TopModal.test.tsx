import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { TopModal, parseTopOutput } from "./TopModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

beforeEach(() => { mockSpawn.mockReset(); });

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(1)",
  ConfigFiles: "/path/compose.yml",
};

const topOutput = `web
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
root                1234                1                   0                   10:00               ?                   00:00:00            nginx: master

db
UID                 PID                 PPID                C                   STIME               TTY                 TIME                CMD
999                 5678                1                   0                   10:00               ?                   00:00:01            postgres
`;

describe("TopModal", () => {
  it("renders modal title with stack name", async () => {
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByText(/Top — myapp/i)).toBeInTheDocument();
    await act(async () => {});
  });

  it("shows spinner while loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    await act(async () => {});
  });

  it("renders service sections after loading", async () => {
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("db")).toBeInTheDocument();
  });

  it("renders process rows", async () => {
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/nginx: master/i)).toBeInTheDocument());
    expect(screen.getByText(/postgres/i)).toBeInTheDocument();
  });

  it("shows empty state when no processes", async () => {
    mockSpawn.mockReturnValue(mockProcess(""));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No running processes found/i)).toBeInTheDocument());
  });

  it("shows error alert on failure", async () => {
    mockSpawn.mockReturnValue(mockProcess("", "permission denied"));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/Could not load processes/i)).toBeInTheDocument());
  });

  it("refresh button triggers reload", async () => {
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    render(<TopModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    mockSpawn.mockReturnValue(mockProcess(topOutput));
    fireEvent.click(screen.getByRole("button", { name: /Refresh/i }));
    expect(mockSpawn).toHaveBeenCalledTimes(2);
    await act(async () => {});
  });
});

describe("parseTopOutput", () => {
  it("parses service name and process rows", () => {
    const result = parseTopOutput(topOutput);
    expect(result).toHaveLength(2);
    expect(result[0].service).toBe("web");
    expect(result[0].titles[0]).toBe("UID");
    expect(result[0].processes).toHaveLength(1);
    expect(result[0].processes[0]).toContain("1234");
    expect(result[1].service).toBe("db");
    expect(result[1].processes[0]).toContain("5678");
  });

  it("returns empty array for empty input", () => {
    expect(parseTopOutput("")).toEqual([]);
    expect(parseTopOutput("\n\n\n")).toEqual([]);
  });

  it("skips blocks with only one line (no header + data)", () => {
    // A single line block can't have both a header and at least one data row
    const singleLineBlock = "just one line\n";
    expect(parseTopOutput(singleLineBlock)).toEqual([]);
  });

  it("skips blocks where no header line is found", () => {
    // Two lines but neither looks like a PS header
    const noHeader = "some random text\nanother random line\n";
    expect(parseTopOutput(noHeader)).toEqual([]);
  });

  it("uses fallback service name when header is the first line of the block", () => {
    // If the first line IS the header, block.slice(0, headerIdx=0).join("").trim() is ""
    // which triggers the `|| \`Service 1\`` fallback
    const headerFirstBlock = `UID                 PID                 PPID                CMD
root                1234                1                   nginx
`;
    const result = parseTopOutput(headerFirstBlock);
    expect(result).toHaveLength(1);
    expect(result[0].service).toBe("Service 1");
    expect(result[0].processes).toHaveLength(1);
  });
});
