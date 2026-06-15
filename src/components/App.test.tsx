import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    detectDockerMode: vi.fn().mockResolvedValue(undefined),
    detectComposeCommand: vi.fn().mockResolvedValue(true),
  };
});

vi.mock("./StacksView", () => ({
  StacksView: () => <div>StacksView rendered</div>,
}));

vi.mock("./AppFooter", () => ({
  AppFooter: () => <div>AppFooter</div>,
}));

import { detectComposeCommand } from "../api";
const mockDetect = vi.mocked(detectComposeCommand);

beforeEach(() => { vi.clearAllMocks(); });

describe("App", () => {
  it("renders nothing until detectComposeCommand resolves", async () => {
    let resolve!: (v: boolean) => void;
    mockDetect.mockReturnValue(new Promise<boolean>(r => { resolve = r; }));
    const { container } = render(<App />);
    expect(container.firstChild).toBeNull();
    await act(async () => { resolve(true); });
  });

  it("renders StacksView after detectComposeCommand resolves", async () => {
    mockDetect.mockResolvedValue(true);
    render(<App />);
    await waitFor(() => expect(screen.getByText("StacksView rendered")).toBeInTheDocument());
  });
});
