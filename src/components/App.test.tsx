import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { App } from "./App";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return { ...actual, detectComposeCommand: vi.fn().mockResolvedValue(undefined) };
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
    let resolve!: () => void;
    mockDetect.mockReturnValue(new Promise<void>(r => { resolve = r; }));
    const { container } = render(<App />);
    expect(container.firstChild).toBeNull();
    await act(async () => { resolve(); });
  });

  it("renders StacksView after detectComposeCommand resolves", async () => {
    mockDetect.mockResolvedValue(undefined);
    render(<App />);
    await waitFor(() => expect(screen.getByText("StacksView rendered")).toBeInTheDocument());
  });
});
