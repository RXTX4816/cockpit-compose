import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { mockSpawn } from "../test/setup";
import { mockProcess } from "../test/helpers";
import { setRuntime } from "../api/cockpit";
import { useDownStack } from "./useDownStack";
import { useKillStack } from "./useKillStack";
import type { ComposeStack } from "../api";

// Characterization of the Down and Kill dialogs' outcomes, observed at the cockpit.spawn
// seam, written before the teardown module. It records the rules as they are today,
// including the places where Down and Kill (and Force remove) disagree.

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const ID = "a".repeat(64);

// `leftover`: what the check after the action finds. `listed`: what Kill's own listing sees.
let world: { leftover: boolean; listed: boolean; composeFails: boolean; rmFails: boolean };

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  world = { leftover: false, listed: false, composeFails: false, rmFails: false };
  mockSpawn.mockImplementation((argv: string[]) => {
    if (argv[0] === "cat") return mockProcess("services: {}\n");
    if (argv[1] === "compose" && (argv.includes("down") || argv.includes("kill"))) {
      return world.composeFails ? mockProcess("", "compose failed") : mockProcess("");
    }
    if (argv.includes("ps")) {
      const sees = argv.includes("--no-trunc") ? world.leftover : world.listed;
      return mockProcess(sees ? ID + "\n" : "");
    }
    if (argv.includes("rm")) return world.rmFails ? mockProcess("", "rm failed") : mockProcess("");
    return mockProcess("");
  });
});

async function down(onDownComplete = vi.fn()) {
  const { result } = renderHook(() => useDownStack(vi.fn(), vi.fn(), onDownComplete));
  act(() => { result.current.open(stack); });
  await act(() => result.current.execute());
  return { result, onDownComplete };
}

async function kill() {
  const { result } = renderHook(() => useKillStack(vi.fn(), vi.fn()));
  act(() => { result.current.open(stack); });
  await act(() => result.current.execute());
  return result;
}

describe("Down", () => {
  it("closes and marks the stack downed when nothing is left", async () => {
    const { result, onDownComplete } = await down();
    expect(result.current.target).toBeNull();
    expect(onDownComplete).toHaveBeenCalledWith(stack);
  });

  it("closes when compose fails but nothing is left (the one rule for done)", async () => {
    world.composeFails = true;
    const { result, onDownComplete } = await down();
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
    expect(onDownComplete).toHaveBeenCalledWith(stack);
  });

  it("stays open with the leftovers when containers remain", async () => {
    world.leftover = true;
    const { result } = await down();
    expect(result.current.target).toBe(stack);
    expect(result.current.leftovers?.ids).toEqual([ID]);
    expect(result.current.error).toBeNull();
  });

  it("shows both the error and the leftovers when compose fails and containers remain", async () => {
    world.composeFails = true;
    world.leftover = true;
    const { result } = await down();
    expect(result.current.error).toMatch(/compose failed/);
    expect(result.current.leftovers?.ids).toEqual([ID]);
  });
});

describe("Kill", () => {
  it("closes when nothing is left", async () => {
    const result = await kill();
    expect(result.current.target).toBeNull();
  });

  it("closes when the removal failed but nothing is left", async () => {
    world.listed = true;
    world.rmFails = true;
    const result = await kill();
    expect(result.current.target).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("shows the leftovers with the error when containers remain", async () => {
    world.listed = true;
    world.leftover = true;
    world.rmFails = true;
    const result = await kill();
    expect(result.current.target).toBe(stack);
    expect(result.current.leftovers?.ids).toEqual([ID]);
    expect(result.current.error).toMatch(/rm failed/);
  });
});

describe("Force remove (from the Down dialog)", () => {
  it("shows the error when the removal fails and containers remain", async () => {
    world.leftover = true;
    const { result } = await down();
    world.listed = true;
    world.rmFails = true;
    await act(() => result.current.forceRemove());
    expect(result.current.error).toMatch(/rm failed/);
    expect(result.current.leftovers?.ids).toEqual([ID]);
  });

  it("closes when the removal succeeds", async () => {
    world.leftover = true;
    const { result } = await down();
    world.leftover = false;
    world.listed = true;
    await act(() => result.current.forceRemove());
    expect(result.current.target).toBeNull();
  });
});
