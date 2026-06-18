import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import { PrettyCard } from "./PrettyCard";
import type { ComposeStack } from "../../api";

vi.mock("../../hooks/useStackActions", () => ({
  useStackActions: vi.fn(),
}));
vi.mock("../../hooks/useStackContainers", () => ({
  useStackContainers: vi.fn(),
}));
vi.mock("../../hooks/useContainerStats", () => ({
  useContainerStats: vi.fn(),
}));
vi.mock("../../hooks/useAutoRefresh", () => ({
  useAutoRefresh: vi.fn(),
}));
vi.mock("./ContainerTable", () => ({
  ContainerTable: () => <div>ContainerTable</div>,
}));
vi.mock("./StatsCell", () => ({
  StatsCell: () => <span>StatsCell</span>,
}));

import { useStackActions } from "../../hooks/useStackActions";
import { useStackContainers } from "../../hooks/useStackContainers";
import { useContainerStats } from "../../hooks/useContainerStats";
const mockUseStackActions = vi.mocked(useStackActions);
const mockUseStackContainers = vi.mocked(useStackContainers);
const mockUseContainerStats = vi.mocked(useContainerStats);

async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
    await Promise.resolve();
  });
}

const stack: ComposeStack = { Name: "myapp", Status: "running(2)", ConfigFiles: "/myapp/compose.yml" };

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
  mockUseStackContainers.mockReturnValue({ containers: [], loading: false, load: vi.fn(), clear: vi.fn() });
  mockUseContainerStats.mockReturnValue({ ports: [], stats: null });
});

describe("PrettyCard", () => {
  it("renders the stack name", () => {
    render(<PrettyCard {...defaultProps} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders service count", () => {
    render(<PrettyCard {...defaultProps} />);
    expect(screen.getAllByText(/2 services/i).length).toBeGreaterThan(0);
  });

  it("renders for stopped stack", () => {
    render(<PrettyCard {...defaultProps} stack={{ ...stack, Status: "exit(0)" }} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("renders for paused stack", () => {
    render(<PrettyCard {...defaultProps} stack={{ ...stack, Status: "paused(1)" }} />);
    expect(screen.getByText("myapp")).toBeInTheDocument();
  });

  it("opens the dropdown menu on kebab button click", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    expect(screen.getByText(/scale/i)).toBeInTheDocument();
  });

  it("calls onKill when Kill is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/kill/i));
    expect(defaultProps.onKill).toHaveBeenCalled();
  });

  it("calls onPrune when Prune is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/prune/i));
    expect(defaultProps.onPrune).toHaveBeenCalled();
  });

  it("calls onEvents when Events is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/events/i));
    expect(defaultProps.onEvents).toHaveBeenCalled();
  });

  it("calls onScale when Scale is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/scale/i));
    expect(defaultProps.onScale).toHaveBeenCalled();
  });

  it("shows confirm restart modal when Restart is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/restart/i));
    expect(screen.getByText(/restart "myapp"/i)).toBeInTheDocument();
  });

  it("shows stop confirm modal when Stop button is clicked for running stack", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /^stop$/i }));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
  });

  it("shows Up button for stopped stack", () => {
    render(<PrettyCard {...defaultProps} stack={{ ...stack, Status: "exit(0)" }} />);
    expect(screen.getByRole("button", { name: /^up$/i })).toBeInTheDocument();
  });

  it("calls onUp when Up button is clicked for stopped stack", async () => {
    render(<PrettyCard {...defaultProps} stack={{ ...stack, Status: "exit(0)" }} />);
    await click(screen.getByRole("button", { name: /^up$/i }));
    expect(defaultProps.onUp).toHaveBeenCalled();
  });

  it("shows stats bar when stats are available", () => {
    mockUseContainerStats.mockReturnValue({ ports: [], stats: { cpu: 25, mem: 100000000 } });
    const { container } = render(<PrettyCard {...defaultProps} />);
    expect(container.querySelector(".pc-cpu-wrap")).toBeInTheDocument();
  });

  it("calls onPull when Pull icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/pull latest images/i));
    expect(defaultProps.onPull).toHaveBeenCalled();
  });

  it("calls onExec when Shell icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/^shell$/i));
    expect(defaultProps.onExec).toHaveBeenCalled();
  });

  it("calls onLogs when Logs icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/view logs/i));
    expect(defaultProps.onLogs).toHaveBeenCalled();
  });

  it("calls onYaml when Edit icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/edit compose file/i));
    expect(defaultProps.onYaml).toHaveBeenCalled();
  });

  it("calls onBackup when Backup icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/^backup$/i));
    expect(defaultProps.onBackup).toHaveBeenCalled();
  });

  it("calls onInfo when Info icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/stack info/i));
    expect(defaultProps.onInfo).toHaveBeenCalled();
  });

  it("calls onDown when Down icon button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByLabelText(/down \(remove containers\)/i));
    expect(defaultProps.onDown).toHaveBeenCalled();
  });

  it("shows expanded container list when expanded=true", () => {
    render(<PrettyCard {...defaultProps} expanded={true} />);
    expect(screen.getByText(/no containers/i)).toBeInTheDocument();
  });

  it("shows container rows when expanded with containers", () => {
    const ctr = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    render(<PrettyCard {...defaultProps} expanded={true} />);
    expect(screen.getByText("web")).toBeInTheDocument();
  });

  it("calls onTop when Top is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/^top$/i));
    expect(defaultProps.onTop).toHaveBeenCalled();
  });

  it("calls onRun when Run is clicked in dropdown", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/^run$/i));
    expect(defaultProps.onRun).toHaveBeenCalled();
  });


  it("calls doAction pause when Pause is clicked in dropdown", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/^pause$/i));
    expect(doAction).toHaveBeenCalledWith("pause", expect.any(Function));
  });

  it("calls doAction start when Start button is clicked for stopped stack", async () => {
    const doAction = vi.fn();
    mockUseStackActions.mockReturnValue({ acting: false, actionError: null, doAction });
    render(<PrettyCard {...defaultProps} stack={{ ...stack, Status: "exit(0)" }} />);
    await click(screen.getByRole("button", { name: /^start$/i }));
    expect(doAction).toHaveBeenCalledWith("start", expect.any(Function));
  });

  it("closes stop confirm modal when X button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /^stop$/i }));
    expect(screen.getByText(/stop "myapp"/i)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/stop "myapp"/i)).not.toBeInTheDocument();
  });

  it("closes restart confirm modal when X button is clicked", async () => {
    render(<PrettyCard {...defaultProps} />);
    await click(screen.getByRole("button", { name: /more actions/i }));
    await click(screen.getByText(/restart/i));
    expect(screen.getByText(/restart "myapp"/i)).toBeInTheDocument();
    await click(screen.getByRole("button", { name: /close/i }));
    expect(screen.queryByText(/restart "myapp"/i)).not.toBeInTheDocument();
  });

  it("renders CPU percentage text for high CPU above 80 percent", () => {
    mockUseContainerStats.mockReturnValue({ ports: [], stats: { cpu: 85, mem: 100000000 } });
    render(<PrettyCard {...defaultProps} />);
    expect(screen.getByText("85.0%")).toBeInTheDocument();
  });

  it("renders CPU percentage text for medium CPU between 50 and 80 percent", () => {
    mockUseContainerStats.mockReturnValue({ ports: [], stats: { cpu: 65, mem: 100000000 } });
    render(<PrettyCard {...defaultProps} />);
    expect(screen.getByText("65.0%")).toBeInTheDocument();
  });

  it("shows extra port count indicator when more than 4 ports are present", () => {
    const ports = Array.from({ length: 5 }, (_, i) => ({
      label: `${8080 + i}`,
      fullLabel: `0.0.0.0:${8080 + i}->80/tcp`,
      bindAddress: "0.0.0.0",
      hostPort: `${8080 + i}`,
      containerPort: "80",
      protocol: "tcp",
      bindType: "localhost" as const,
    }));
    mockUseContainerStats.mockReturnValue({ ports, stats: null });
    render(<PrettyCard {...defaultProps} />);
    expect(screen.getByText("+1")).toBeInTheDocument();
  });

  it("shows unhealthy health icon when a container has failing health", () => {
    const ctr = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web", Health: "unhealthy" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<PrettyCard {...defaultProps} />);
    expect(container.querySelector(".pc-health-icon--warn")).toBeInTheDocument();
  });

  it("shows healthy health icon when all containers pass their health check", () => {
    const ctr = { ID: "abc", Name: "web_1", Image: "nginx", State: "running", Status: "Up 2h", Ports: "", Service: "web", Health: "healthy" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    const { container } = render(<PrettyCard {...defaultProps} />);
    expect(container.querySelector(".pc-health-icon--ok")).toBeInTheDocument();
  });

  it("shows start button for stopped service in expanded view", () => {
    const ctr = { ID: "abc", Name: "web_1", Image: "nginx", State: "exited", Status: "Exited 2h", Ports: "", Service: "web" };
    mockUseStackContainers.mockReturnValue({ containers: [ctr], loading: false, load: vi.fn(), clear: vi.fn() });
    render(<PrettyCard {...defaultProps} expanded={true} />);
    expect(screen.getByLabelText("Start service")).toBeInTheDocument();
  });
});
