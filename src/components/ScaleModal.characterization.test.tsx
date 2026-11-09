import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { ScaleModal } from "./ScaleModal";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { setRuntime } from "../api/cockpit";
import type { ComposeStack } from "../api";

// Characterization of Scale as observed at the cockpit.spawn seam, written before it moved
// onto the stack-operation module.

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const COMPOSE = "services:\n  web:\n    image: nginx\n    profiles: [dev]\n";

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  mockSpawn.mockImplementation((argv: string[]) => mockProcess(argv[0] === "cat" ? COMPOSE : argv.includes("ps") ? "" : ""));
});

describe("Scale", () => {
  it("runs compose up with --scale for the stack's profiles, escalated", async () => {
    render(<ScaleModal stack={stack} onClose={vi.fn()} />);
    await waitFor(() => screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByLabelText("Increase replicas for web"));
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    await waitFor(() => screen.getByRole("button", { name: /apply/i }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /apply/i })); });
    const call = mockSpawn.mock.calls.find(c => (c[0] as string[]).includes("--scale"));
    expect(call?.[0]).toEqual(
      ["docker", "compose", "--profile", "dev", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "up", "-d", "--scale", "web=1"]);
    expect((call?.[1] as { superuser?: string }).superuser).toBe("try");
  });
});
