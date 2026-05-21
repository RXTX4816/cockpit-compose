import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StackRow } from "./StackRow";
import type { ComposeStack } from "../../api";

vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("./StatsCell", () => ({
  StatsCell: () => <span>StatsCell</span>,
}));

import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseStackContainers = vi.mocked(useStackContainers);

const stack: ComposeStack = {
  Name: "myapp",
  Status: "running(2)",
  ConfigFiles: "/path/compose.yml",
};

const defaultProps = {
  stack,
  expanded: false,
  onToggle: vi.fn(),
  onLogs: vi.fn(),
  onYaml: vi.fn(),
  onInfo: vi.fn(),
  onDown: vi.fn(),
  onPull: vi.fn(),
  onActingChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction: vi.fn() });
  mockUseStackContainers.mockReturnValue({
    containers: [],
    loading: false,
    load: vi.fn(),
    clear: vi.fn(),
  });
});

describe("StackRow", () => {
  it("renders stack name", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText(/2 services/i)).toBeInTheDocument();
  });

  it("renders Up button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Up/i })).toBeInTheDocument();
  });

  it("renders Stop button when running", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Stop/i })).toBeInTheDocument();
  });

  it("does not render Stop button when down", () => {
    render(<StackRow {...defaultProps} stack={{ ...stack, Status: "exit(2)" }} />);
    expect(screen.queryByRole("button", { name: /Stop/i })).toBeNull();
  });

  it("renders Logs button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Logs/i })).toBeInTheDocument();
  });

  it("renders Edit button", () => {
    render(<StackRow {...defaultProps} />);
    expect(screen.getByRole("button", { name: /Edit/i })).toBeInTheDocument();
  });

  it("calls onLogs when Logs button clicked", () => {
    const onLogs = vi.fn();
    render(<StackRow {...defaultProps} onLogs={onLogs} />);
    fireEvent.click(screen.getByRole("button", { name: /Logs/i }));
    expect(onLogs).toHaveBeenCalledOnce();
  });

  it("calls onYaml when Edit button clicked", () => {
    const onYaml = vi.fn();
    render(<StackRow {...defaultProps} onYaml={onYaml} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/i }));
    expect(onYaml).toHaveBeenCalledOnce();
  });

  it("calls onToggle when toggle button clicked", () => {
    const onToggle = vi.fn();
    render(<StackRow {...defaultProps} onToggle={onToggle} />);
    // DataListToggle renders with the id we pass: id="toggle-{name}"
    const toggleBtn = document.getElementById("toggle-myapp");
    expect(toggleBtn).not.toBeNull();
    fireEvent.click(toggleBtn!);
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("shows action error alert when actionError is set", () => {
    mockUseStackActions.mockReturnValue({
      acting: false,
      actionError: "Failed to start",
      doAction: vi.fn(),
    });
    render(<StackRow {...defaultProps} />);
    expect(screen.getByText("Failed to start")).toBeInTheDocument();
  });

  it("shows spinner when loading containers (expanded)", () => {
    mockUseStackContainers.mockReturnValue({
      containers: [],
      loading: true,
      load: vi.fn(),
      clear: vi.fn(),
    });
    render(<StackRow {...defaultProps} expanded />);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("shows No containers found when expanded with no containers", () => {
    render(<StackRow {...defaultProps} expanded />);
    expect(screen.getByText(/No containers found/i)).toBeInTheDocument();
  });

  it("calls doAction with start when Up button clicked", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<StackRow {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /Up/i }));
    expect(doAction).toHaveBeenCalledWith("start", expect.any(Function));
  });
});
