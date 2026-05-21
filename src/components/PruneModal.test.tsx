import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PruneModal } from "./PruneModal";
import type { ComposeStack } from "../api";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listProjectContainerImageRefs: vi.fn(),
    listImagesByRepo: vi.fn(),
    listAllContainerImages: vi.fn(),
    removeImages: vi.fn(),
    listStoppedContainers: vi.fn(),
    listDanglingVolumes: vi.fn(),
    listProjectNetworks: vi.fn(),
    pruneContainers: vi.fn(),
    pruneVolumes: vi.fn(),
    pruneNetworks: vi.fn(),
  };
});

import {
  listProjectContainerImageRefs,
  listImagesByRepo,
  listAllContainerImages,
  removeImages,
  listStoppedContainers,
  listDanglingVolumes,
  listProjectNetworks,
  pruneContainers,
  pruneVolumes,
  pruneNetworks,
} from "../api";

const mockListProjectContainerImageRefs = vi.mocked(listProjectContainerImageRefs);
const mockListImagesByRepo = vi.mocked(listImagesByRepo);
const mockListAllContainerImages = vi.mocked(listAllContainerImages);
const mockRemoveImages = vi.mocked(removeImages);
const mockListStoppedContainers = vi.mocked(listStoppedContainers);
const mockListDanglingVolumes = vi.mocked(listDanglingVolumes);
const mockListProjectNetworks = vi.mocked(listProjectNetworks);
const mockPruneContainers = vi.mocked(pruneContainers);
const mockPruneVolumes = vi.mocked(pruneVolumes);
const mockPruneNetworks = vi.mocked(pruneNetworks);

const runningStack: ComposeStack = {
  Name: "gitea",
  Status: "running(1)",
  ConfigFiles: "/srv/gitea/compose.yml",
};

const stoppedStack: ComposeStack = {
  Name: "gitea",
  Status: "exit(0)",
  ConfigFiles: "/srv/gitea/compose.yml",
};

// Default mock setup: project has one container using gitea:1.26.2.
// The repo has two versions; 1.25.2 is not in the global in-use name list → unused.
function setupDefaultImageMocks() {
  mockListProjectContainerImageRefs.mockImplementation(() =>
    mockProcess("docker.gitea.com/gitea:1.26.2\n")
  );
  // Format: "repo:tag\tsize" — parsed into name + display by findUnusedProjectImages.
  mockListImagesByRepo.mockImplementation(() =>
    mockProcess("docker.gitea.com/gitea:1.26.2\t248MB\ndocker.gitea.com/gitea:1.25.2\t262MB\n")
  );
  // Only 1.26.2 is in use globally; 1.25.2 is not → should be listed as removable.
  mockListAllContainerImages.mockImplementation(() =>
    mockProcess("docker.gitea.com/gitea:1.26.2\n")
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultImageMocks();
  mockListStoppedContainers.mockImplementation(() => mockProcess("gitea_server_1\n"));
  mockListDanglingVolumes.mockImplementation(() => mockProcess(""));
  mockListProjectNetworks.mockImplementation(() => mockProcess(""));
  mockRemoveImages.mockImplementation(() => mockProcess(""));
  mockPruneContainers.mockImplementation(() => mockProcess(""));
  mockPruneVolumes.mockImplementation(() => mockProcess(""));
  mockPruneNetworks.mockImplementation(() => mockProcess(""));
});

describe("PruneModal — select step", () => {
  it("renders title with stack name", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Prune resources — gitea/i)).toBeInTheDocument();
  });

  it("shows generic destructive warning", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Destructive action — cannot be undone/i)).toBeInTheDocument();
  });

  it("does NOT show stopped-stack warning for a running stack", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/Stack is not running/i)).toBeNull();
  });

  it("does NOT show stopped-stack warning for a partial stack", () => {
    const partial: ComposeStack = { ...runningStack, Status: "running(1/2)" };
    render(<PruneModal stack={partial} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.queryByText(/Stack is not running/i)).toBeNull();
  });

  it("shows stopped-stack danger warning for a stopped stack", () => {
    render(<PruneModal stack={stoppedStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Stack is not running/i)).toBeInTheDocument();
  });

  it("images and containers default checked, volumes and networks default unchecked", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole("checkbox", { name: /Images/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Containers/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Volumes/i })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Networks/i })).not.toBeChecked();
  });

  it("toggles a checkbox on click", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    const cb = screen.getByRole("checkbox", { name: /Images/i });
    fireEvent.click(cb);
    expect(cb).not.toBeChecked();
  });

  it("Preview button is disabled when nothing is selected", () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Images/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Containers/i }));
    expect(screen.getByRole("button", { name: /Preview/i })).toBeDisabled();
  });

  it("calls onClose when Cancel clicked", () => {
    const onClose = vi.fn();
    render(<PruneModal stack={runningStack} onClose={onClose} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows preview error on select step when a command fails", async () => {
    mockListProjectContainerImageRefs.mockImplementation(() =>
      mockProcess("", "permission denied")
    );
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => expect(screen.getByText(/permission denied/i)).toBeInTheDocument());
    expect(screen.getByText(/Prune resources — gitea/i)).toBeInTheDocument();
  });
});

describe("PruneModal — preview step", () => {
  async function goToPreview(stack: ComposeStack = runningStack) {
    render(<PruneModal stack={stack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() =>
      expect(screen.getByText(/Preview — resources to be removed/i)).toBeInTheDocument()
    );
  }

  it("transitions to preview step after clicking Preview", async () => {
    await goToPreview();
    expect(screen.getByText(/Preview — resources to be removed/i)).toBeInTheDocument();
  });

  it("calls the three image helper functions for the project", async () => {
    await goToPreview();
    expect(mockListProjectContainerImageRefs).toHaveBeenCalledWith("gitea");
    expect(mockListImagesByRepo).toHaveBeenCalledWith("docker.gitea.com/gitea");
    expect(mockListAllContainerImages).toHaveBeenCalled();
  });

  it("shows only unused image versions (1.25.2 unused, 1.26.2 in use)", async () => {
    await goToPreview();
    await waitFor(() =>
      expect(screen.getByText(/gitea:1\.25\.2/)).toBeInTheDocument()
    );
    expect(screen.queryByText(/gitea:1\.26\.2/)).toBeNull();
  });

  it("shows stopped container names", async () => {
    await goToPreview();
    await waitFor(() =>
      expect(screen.getByText("gitea_server_1")).toBeInTheDocument()
    );
  });

  it("shows Nothing to remove when all images are in use", async () => {
    // Both versions are in use
    mockListAllContainerImages.mockImplementation(() =>
      mockProcess("docker.gitea.com/gitea:1.26.2\ndocker.gitea.com/gitea:1.25.2\n")
    );
    await goToPreview();
    await waitFor(() =>
      expect(screen.getByText(/Nothing to remove/i)).toBeInTheDocument()
    );
  });

  it("shows Nothing to remove when project has no containers (stack never started)", async () => {
    mockListProjectContainerImageRefs.mockImplementation(() => mockProcess(""));
    await goToPreview();
    await waitFor(() =>
      expect(screen.getByText(/Nothing to remove/i)).toBeInTheDocument()
    );
    expect(mockListImagesByRepo).not.toHaveBeenCalled();
  });

  it("does NOT show stopped-stack warning for a running stack in preview", async () => {
    await goToPreview(runningStack);
    expect(screen.queryByText(/Stack is not running/i)).toBeNull();
  });

  it("shows stopped-stack warning for a stopped stack in preview", async () => {
    await goToPreview(stoppedStack);
    expect(screen.getByText(/Stack is not running/i)).toBeInTheDocument();
  });

  it("Back button returns to select step", async () => {
    await goToPreview();
    fireEvent.click(screen.getByRole("button", { name: /← Back/i }));
    expect(screen.getByText(/Prune resources — gitea/i)).toBeInTheDocument();
  });
});

describe("PruneModal — execute prune", () => {
  it("calls removeImages with unused image names and pruneContainers", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<PruneModal stack={runningStack} onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => screen.getByRole("button", { name: /Prune selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Prune selected/i }));
    await waitFor(() =>
      expect(mockRemoveImages).toHaveBeenCalledWith(["docker.gitea.com/gitea:1.25.2"])
    );
    expect(mockPruneContainers).toHaveBeenCalledWith("gitea");
    expect(mockPruneVolumes).not.toHaveBeenCalled();
    expect(mockPruneNetworks).not.toHaveBeenCalled();
  });

  it("skips removeImages when no unused images found", async () => {
    mockListAllContainerImages.mockImplementation(() =>
      mockProcess("docker.gitea.com/gitea:1.26.2\ndocker.gitea.com/gitea:1.25.2\n")
    );
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => screen.getByRole("button", { name: /Prune selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Prune selected/i }));
    await waitFor(() => expect(mockPruneContainers).toHaveBeenCalled());
    expect(mockRemoveImages).not.toHaveBeenCalled();
  });

  it("calls onSuccess and onClose after successful prune", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<PruneModal stack={runningStack} onClose={onClose} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => screen.getByRole("button", { name: /Prune selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Prune selected/i }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows error and stays open when removeImages fails", async () => {
    mockRemoveImages.mockImplementation(() => mockProcess("", "image is in use"));
    const onSuccess = vi.fn();
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => screen.getByRole("button", { name: /Prune selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Prune selected/i }));
    await waitFor(() => expect(screen.getByText(/image is in use/i)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("calls pruneVolumes and pruneNetworks when selected", async () => {
    render(<PruneModal stack={runningStack} onClose={vi.fn()} onSuccess={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Volumes/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Networks/i }));
    fireEvent.click(screen.getByRole("button", { name: /Preview/i }));
    await waitFor(() => screen.getByRole("button", { name: /Prune selected/i }));
    fireEvent.click(screen.getByRole("button", { name: /Prune selected/i }));
    await waitFor(() => expect(mockPruneVolumes).toHaveBeenCalledWith("gitea"));
    expect(mockPruneNetworks).toHaveBeenCalledWith("gitea");
  });
});
