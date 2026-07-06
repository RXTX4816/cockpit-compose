import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { GlobalPruneModal } from "./GlobalPruneModal";
import { mockProcess } from "../test/helpers";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listAllImages: vi.fn(),
    listInUseImageIds: vi.fn(),
    pruneImages: vi.fn(),
  };
});

import { listAllImages, listInUseImageIds, pruneImages } from "../api";

const mockListAllImages = vi.mocked(listAllImages);
const mockListInUseImageIds = vi.mocked(listInUseImageIds);
const mockPruneImages = vi.mocked(pruneImages);

beforeEach(() => {
  vi.clearAllMocks();
  mockListInUseImageIds.mockResolvedValue([]);
});

describe("GlobalPruneModal", () => {
  it("shows a loading state while scanning, then only images not in use", async () => {
    mockListAllImages.mockImplementation(() =>
      mockProcess("sha256:aaa\tmyapp:latest\t128MB\t2 days ago\nsha256:bbb\t<none>:<none>\t64MB\t3 weeks ago\nsha256:ccc\tinuse:latest\t50MB\t1 day ago\n")
    );
    mockListInUseImageIds.mockResolvedValue(["sha256:ccc"]);
    render(<GlobalPruneModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByText(/Scanning for unused images/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("myapp:latest")).toBeInTheDocument());
    expect(screen.getByText("<none>:<none>")).toBeInTheDocument();
    expect(screen.queryByText("inuse:latest")).not.toBeInTheDocument();
    expect(screen.getByText(/Total reclaimable/i)).toBeInTheDocument();
  });

  it("shows a nothing-found message when every image is in use", async () => {
    mockListAllImages.mockImplementation(() => mockProcess("sha256:ccc\tinuse:latest\t50MB\t1 day ago\n"));
    mockListInUseImageIds.mockResolvedValue(["sha256:ccc"]);
    render(<GlobalPruneModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No unused images found/i)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Prune$/i })).toBeDisabled();
  });

  it("shows a load error if scanning fails", async () => {
    mockListAllImages.mockImplementation(() => mockProcess("", "scan boom"));
    render(<GlobalPruneModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("scan boom")).toBeInTheDocument());
  });

  it("keeps the Prune button disabled until the confirmation checkbox is ticked", async () => {
    mockListAllImages.mockImplementation(() => mockProcess("sha256:aaa\tmyapp:latest\t128MB\t2 days ago\n"));
    render(<GlobalPruneModal onClose={vi.fn()} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("myapp:latest")).toBeInTheDocument());

    expect(screen.getByRole("button", { name: /^Prune$/i })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: /^Prune$/i })).toBeEnabled();
  });

  it("prunes and shows the CLI's own result output, then calls onSuccess", async () => {
    mockListAllImages.mockImplementation(() => mockProcess("sha256:aaa\tmyapp:latest\t128MB\t2 days ago\n"));
    mockPruneImages.mockImplementation(() => mockProcess("Deleted Images:\nsha256:aaa\n\nTotal reclaimed space: 128MB\n"));
    const onSuccess = vi.fn();
    render(<GlobalPruneModal onClose={vi.fn()} onSuccess={onSuccess} />);

    await waitFor(() => expect(screen.getByText("myapp:latest")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Prune$/i }));

    await waitFor(() => expect(screen.getByText(/Total reclaimed space: 128MB/)).toBeInTheDocument());
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows a prune error without closing the modal", async () => {
    mockListAllImages.mockImplementation(() => mockProcess("sha256:aaa\tmyapp:latest\t128MB\t2 days ago\n"));
    mockPruneImages.mockImplementation(() => mockProcess("", "prune boom"));
    const onClose = vi.fn();
    render(<GlobalPruneModal onClose={onClose} onSuccess={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("myapp:latest")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /^Prune$/i }));

    await waitFor(() => expect(screen.getByText("prune boom")).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose when Cancel is clicked", async () => {
    mockListAllImages.mockImplementation(() => mockProcess(""));
    const onClose = vi.fn();
    render(<GlobalPruneModal onClose={onClose} onSuccess={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/No unused images found/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
