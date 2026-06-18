import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ScaleModal } from "./ScaleModal";
import { mockProcess } from "../test/helpers";
import type { ComposeStack } from "../api";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    listContainers: vi.fn(),
    readComposeFile: vi.fn(),
    getServicesFromCompose: vi.fn(),
    scaleStack: vi.fn(),
    composeFileSuperuser: vi.fn(),
    readAllProfiles: vi.fn(),
    isRootlessMode: vi.fn(),
  };
});

import {
  listContainers,
  readComposeFile,
  getServicesFromCompose,
  scaleStack,
  composeFileSuperuser,
  readAllProfiles,
  isRootlessMode,
} from "../api";

const mockListContainers = vi.mocked(listContainers);
const mockReadComposeFile = vi.mocked(readComposeFile);
const mockGetServicesFromCompose = vi.mocked(getServicesFromCompose);
const mockScaleStack = vi.mocked(scaleStack);
const mockComposeFileSuperuser = vi.mocked(composeFileSuperuser);
const mockReadAllProfiles = vi.mocked(readAllProfiles);
const mockIsRootlessMode = vi.mocked(isRootlessMode);

const stack: ComposeStack = { Name: "myapp", Status: "running(2)", ConfigFiles: "/myapp/compose.yml" };

beforeEach(() => {
  mockListContainers.mockReturnValue(mockProcess("[]"));
  mockReadComposeFile.mockReturnValue(mockProcess("services:\n  web: {}\n  worker: {}"));
  mockGetServicesFromCompose.mockReturnValue(["web", "worker"]);
  mockScaleStack.mockReturnValue(mockProcess(""));
  mockComposeFileSuperuser.mockResolvedValue(undefined);
  mockReadAllProfiles.mockResolvedValue([]);
  mockIsRootlessMode.mockReturnValue(false);
});

describe("ScaleModal", () => {
  it("shows spinner while loading", () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    expect(document.querySelector(".pf-v6-c-spinner")).toBeInTheDocument();
  });

  it("renders service inputs after loading", async () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText("web")).toBeInTheDocument());
    expect(screen.getByText("worker")).toBeInTheDocument();
  });

  it("calls onClose when cancel is clicked", async () => {
    const onClose = vi.fn();
    render(<ScaleModal stack={stack} onClose={onClose} />);
    await waitFor(() => screen.getByRole("button", { name: /cancel/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("continue button is disabled when no counts changed", async () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("shows the confirm step after clicking continue with changes", async () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => expect(screen.getByText(/confirm scaling/i)).toBeInTheDocument());
  });

  it("calls scaleStack and onSuccess on apply", async () => {
    const onSuccess = vi.fn();
    const onClose = vi.fn();
    render(<ScaleModal stack={stack} onClose={onClose} onSuccess={onSuccess} />);
    await waitFor(() => screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /apply/i }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /apply/i })); });
    await waitFor(() => expect(mockScaleStack).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  it("shows load error when service info fails to load", async () => {
    mockListContainers.mockReturnValue(mockProcess("", "connection refused"));
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => expect(screen.getByText(/connection refused/i)).toBeInTheDocument());
  });

  it("enables continue button after decrementing (minus) a replica count", async () => {
    const container = JSON.stringify({ ID: "abc", Name: "myapp_web_1", Image: "nginx", State: "running", Status: "Up", Ports: "", Service: "web" });
    mockListContainers.mockReturnValue(mockProcess(container));
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("Decrease replicas for web"));
    fireEvent.click(screen.getByLabelText("Decrease replicas for web"));
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("enables continue button after changing input directly", async () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("web replica count"));
    const input = screen.getByLabelText("web replica count");
    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });

  it("shows port conflict warning when scaling a service with host ports above 1", async () => {
    const container = JSON.stringify({ ID: "abc", Name: "myapp_web_1", Image: "nginx", State: "running", Status: "Up", Ports: "0.0.0.0:80->80/tcp", Service: "web" });
    mockListContainers.mockReturnValue(mockProcess(container));
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByText(/port conflict/i));
  });
});
