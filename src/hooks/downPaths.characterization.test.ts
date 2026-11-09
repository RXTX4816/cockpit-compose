import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { useDownStack } from "./useDownStack";
import { buildDownStarter } from "../lib/backgroundActions";
import { setRuntime } from "../api/cockpit";
import type { ComposeStack } from "../api";

// Characterization of Down as observed at the cockpit.spawn seam, across the paths a user
// can start it from. Written before the stack-operation module so its introduction is
// visibly a behaviour-preserving move, apart from the one deliberate change in its own commit.

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const COMPOSE = "services:\n  web:\n    image: nginx\n    profiles: [dev]\n";

function downCall() {
  return mockSpawn.mock.calls.find(c => (c[0] as string[]).includes("down"));
}

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  mockSpawn.mockImplementation((argv: string[]) =>
    mockProcess(argv[0] === "cat" ? COMPOSE : ""));
});

describe("Down from the dialog", () => {
  it("runs compose down for the project with its files and the stack's profiles", async () => {
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect(downCall()?.[0]).toEqual(
      ["docker", "compose", "--profile", "dev", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "down"]);
  });

  it("escalates (fails safe to 'try' when the user cannot be looked up)", async () => {
    const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn()));
    act(() => { result.current.open(stack); });
    await act(() => result.current.execute());
    expect((downCall()?.[1] as { superuser?: string }).superuser).toBe("try");
  });
});

describe("Down from the background drawer and bulk", () => {
  it("runs compose down for the project with its files", async () => {
    const launch = vi.fn();
    await buildDownStarter(stack)(launch);
    await launch.mock.calls[0][0];
    const args = downCall()?.[0] as string[];
    expect(args).toEqual(expect.arrayContaining(["docker", "compose", "-p", "myapp", "-f", "/srv/myapp/compose.yml", "down"]));
  });

  // Today the drawer ignores the stack's profiles; the dialog above uses them. This pins the
  // current behaviour; the next commit changes it on purpose.
  it("does not pass the stack's profiles (current behaviour)", async () => {
    const launch = vi.fn();
    await buildDownStarter(stack)(launch);
    await launch.mock.calls[0][0];
    expect(downCall()?.[0]).not.toContain("--profile");
  });
});
