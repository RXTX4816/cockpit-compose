import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MinimalCard } from "./MinimalCard";
import type { ComposeStack, ComposeContainer } from "../../api";

vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useServiceActions", () => ({
  useServiceActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("../../hooks/useAutoRefresh", () => ({
  useAutoRefresh: vi.fn(),
}));
vi.mock("./ContainerTable", () => ({
  ContainerTable: () => <div>ContainerTable</div>,
}));
vi.mock("../LogsModal", () => ({
  LogsModal: () => <div>LogsModal</div>,
}));

import { useStackActions } from "../../hooks/useStackActions";
import { useServiceActions } from "../../hooks/useServiceActions";
import { useStackContainers } from "../../hooks/useStackContainers";
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseServiceActions = vi.mocked(useServiceActions);
const mockUseStackContainers = vi.mocked(useStackContainers);

const stack: ComposeStack = { Name: "myapp", Status: "running(2)", ConfigFiles: "/myapp/compose.yml" };
const stoppedStack: ComposeStack = { Name: "myapp", Status: "exit(0)", ConfigFiles: "/myapp/compose.yml" };

const containers: ComposeContainer[] = [
  { ID: "abc123", Name: "myapp_web_1", Image: "nginx", State: "running", Status: "Up 2 hours", Ports: "", Service: "web" },
];

const defaultProps = {
  stack,
  expanded: false,
  onToggle: vi.fn(),
  onLogs: vi.fn(),
  onYaml: vi.fn(),
  onInfo: vi.fn(),
  onDown: vi.fn(),
  onKill: vi.fn(),
  onUp: vi.fn(),
  onPull: vi.fn(),
  onEvents: vi.fn(),
  onTop: vi.fn(),
  onExec: vi.fn(),
  onRun: vi.fn(),
  onPrune: vi.fn(),
  onBackup: vi.fn(),
  onScale: vi.fn(),
  onActingChange: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction: vi.fn() });
  mockUseServiceActions.mockReturnValue({ actingService: null, doServiceAction: vi.fn() });
  mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: vi.fn(), clear: vi.fn() });
});

describe("MinimalCard", () => {
  it("renders the stack name", () => {
    render(<MinimalCard {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<MinimalCard {...defaultProps} />);
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it("shows Down button for running stack", () => {
    render(<MinimalCard {...defaultProps} />);
    expect(screen.getByRole("button", { name: /down/i })).toBeInTheDocument();
  });

  it("shows Up button for stopped stack", () => {
    render(<MinimalCard {...defaultProps} stack={stoppedStack} />);
    expect(screen.getByRole("button", { name: /start stack/i })).toBeInTheDocument();
  });

  it("calls onUp when Up button is clicked for stopped stack", () => {
    render(<MinimalCard {...defaultProps} stack={stoppedStack} />);
    fireEvent.click(screen.getByRole("button", { name: /start stack/i }));
    expect(defaultProps.onUp).toHaveBeenCalled();
  });

  it("calls onDown when Down button is clicked", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /down/i }));
    expect(defaultProps.onDown).toHaveBeenCalled();
  });

  it("opens the dropdown menu on kebab button click", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByText(/pull/i)).toBeInTheDocument();
  });

  it("calls onPull when Pull is clicked in dropdown", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/pull/i));
    expect(defaultProps.onPull).toHaveBeenCalled();
  });

  it("calls onLogs when Logs is clicked in dropdown", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/logs/i));
    expect(defaultProps.onLogs).toHaveBeenCalled();
  });

  it("calls onYaml when Edit is clicked in dropdown", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/edit/i));
    expect(defaultProps.onYaml).toHaveBeenCalled();
  });

  it("calls onInfo when Info is clicked in dropdown", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/info/i));
    expect(defaultProps.onInfo).toHaveBeenCalled();
  });

  it("shows stop confirm modal when Stop is clicked in dropdown", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^stop$/i));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
  });

  it("confirms stop action and calls doAction", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^stop$/i));
    fireEvent.click(screen.getAllByRole("button", { name: /stop/i }).find(b => b.classList.contains("pf-m-danger")) as Element);
    expect(doAction).toHaveBeenCalledWith("stop", expect.any(Function));
  });

  it("renders container dots when containers are available", () => {
    mockUseStackContainers.mockReturnValue({ containers, loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<MinimalCard {...defaultProps} />);
    expect(container.querySelector(".mc-dot")).toBeInTheDocument();
  });

  it("closes stop modal when cancel is clicked", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^stop$/i));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(screen.queryByText(/stop "myapp"/i)).not.toBeInTheDocument();
  });

  it("calls doAction restart when Restart is clicked in dropdown", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^restart$/i));
    expect(doAction).toHaveBeenCalledWith("restart", expect.any(Function));
  });

  it("calls doAction pause when Pause is clicked in dropdown", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^pause$/i));
    expect(doAction).toHaveBeenCalledWith("pause", expect.any(Function));
  });

  it("shows stopped state visually for stopped stack", () => {
    render(<MinimalCard {...defaultProps} stack={{ ...stack, Status: "exit(0)" }} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders for paused stack", () => {
    render(<MinimalCard {...defaultProps} stack={{ ...stack, Status: "paused(1)" }} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("closes stop modal when X button is clicked", () => {
    render(<MinimalCard {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^stop$/i));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/stop "myapp"/i)).not.toBeInTheDocument();
  });

  it("shows healthy dot for container with healthy health check", () => {
    const ctr: ComposeContainer = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web", Health: "healthy" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<MinimalCard {...defaultProps} />);
    expect(container.querySelector(".mc-dot--healthy")).toBeInTheDocument();
  });

  it("shows unhealthy dot for container with unhealthy health check", () => {
    const ctr: ComposeContainer = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web", Health: "unhealthy" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<MinimalCard {...defaultProps} />);
    expect(container.querySelector(".mc-dot--unhealthy")).toBeInTheDocument();
  });

  it("shows starting dot for container with starting health check", () => {
    const ctr: ComposeContainer = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web", Health: "starting" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<MinimalCard {...defaultProps} />);
    expect(container.querySelector(".mc-dot--starting")).toBeInTheDocument();
  });

  it("shows stopped dot for exited container with no health", () => {
    const ctr: ComposeContainer = { ID: "abc", Name: "web_1", Image: "nginx", State: "exited", Status: "Exited 2h", Ports: "", Service: "web" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<MinimalCard {...defaultProps} />);
    expect(container.querySelector(".mc-dot--stopped")).toBeInTheDocument();
  });

  it("shows Unpause in dropdown for paused stack", () => {
    const pausedStack: ComposeStack = { Name: "myapp", Status: "paused(1)", ConfigFiles: "/myapp/compose.yml" };
    render(<MinimalCard {...defaultProps} stack={pausedStack} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByText(/unpause/i)).toBeInTheDocument();
  });

  it("calls doAction unpause when Unpause is clicked for paused stack", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    const pausedStack: ComposeStack = { Name: "myapp", Status: "paused(1)", ConfigFiles: "/myapp/compose.yml" };
    render(<MinimalCard {...defaultProps} stack={pausedStack} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/unpause/i));
    expect(doAction).toHaveBeenCalledWith("unpause", expect.any(Function));
  });

  it("calls doAction start when Start is clicked in dropdown for stopped stack", () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<MinimalCard {...defaultProps} stack={stoppedStack} />);
    fireEvent.click(screen.getByRole("button", { name: /more actions/i }));
    fireEvent.click(screen.getByText(/^start$/i));
    expect(doAction).toHaveBeenCalledWith("start", expect.any(Function));
  });

  describe("selection", () => {
    it("does not render a checkbox when onToggleSelect is not provided", () => {
      render(<MinimalCard {...defaultProps} />);
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("renders a checkbox reflecting isSelected and calls onToggleSelect on click, without opening the container bubble", () => {
      const onToggleSelect = vi.fn();
      render(<MinimalCard {...defaultProps} onToggleSelect={onToggleSelect} isSelected />);
      const checkbox = screen.getByRole("checkbox") as HTMLInputElement;
      expect(checkbox.checked).toBe(true);
      fireEvent.click(checkbox);
      expect(onToggleSelect).toHaveBeenCalledOnce();
      expect(screen.queryByText(/no containers/i)).not.toBeInTheDocument();
    });
  });
});
