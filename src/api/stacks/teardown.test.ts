import { describe, it, expect, beforeEach } from "vitest";
import { mockSpawn } from "../../test/setup";
import { mockProcess } from "../../test/helpers";
import { setRuntime } from "../cockpit";
import type { ComposeStack } from "../types";
import { tearDownStack, forceRemoveStack, recheckStack } from "./teardown";

const stack: ComposeStack = { Name: "myapp", Status: "running(1)", ConfigFiles: "/srv/myapp/compose.yml" };
const ID = "b".repeat(64);

// `left`: what the check after the action finds (null: the check itself fails).
// `listed`: what Kill's own listing sees.
let world: { left: boolean | null; listed: boolean; composeFails: boolean; rmFails: boolean };

beforeEach(() => {
  mockSpawn.mockReset();
  setRuntime("docker");
  world = { left: false, listed: false, composeFails: false, rmFails: false };
  mockSpawn.mockImplementation((argv: string[]) => {
    if (argv[0] === "cat") return mockProcess("services: {}\n");
    if (argv[1] === "compose" && (argv.includes("down") || argv.includes("kill"))) {
      return world.composeFails ? mockProcess("", "compose failed") : mockProcess("");
    }
    if (argv.includes("ps")) {
      if (argv.includes("--no-trunc")) return world.left === null ? mockProcess("", "ps failed") : mockProcess(world.left ? ID + "\n" : "");
      return mockProcess(world.listed ? ID + "\n" : "");
    }
    if (argv.includes("rm")) return world.rmFails ? mockProcess("", "rm failed") : mockProcess("");
    return mockProcess("");
  });
});

describe.each(["down", "kill"] as const)("tearDownStack(%s)", kind => {
  it("is gone when nothing is left", async () => {
    expect((await tearDownStack(stack, kind)).outcome).toEqual({ state: "gone", warning: null });
  });

  it("is gone, with a warning, when the command failed but nothing is left", async () => {
    world.composeFails = kind === "down";
    world.listed = kind === "kill";
    world.rmFails = true;
    const { outcome } = await tearDownStack(stack, kind);
    expect(outcome.state).toBe("gone");
    if (kind === "down") expect(outcome).toMatchObject({ warning: expect.stringMatching(/compose failed/) });
  });

  it("reports the leftovers when containers remain", async () => {
    world.left = true;
    const { outcome } = await tearDownStack(stack, kind);
    expect(outcome).toMatchObject({ state: "remaining", leftovers: { ids: [ID] }, error: null });
  });

  it("reports the leftovers with the error when the command failed and containers remain", async () => {
    world.left = true;
    world.composeFails = kind === "down";
    world.listed = kind === "kill";
    world.rmFails = true;
    const { outcome } = await tearDownStack(stack, kind);
    expect(outcome).toMatchObject({ state: "remaining", leftovers: { ids: [ID] }, error: expect.any(String) });
  });

  it("fails when the command failed and what is left cannot be checked", async () => {
    world.left = null;
    world.composeFails = kind === "down";
    world.listed = kind === "kill";
    world.rmFails = true;
    expect((await tearDownStack(stack, kind)).outcome).toMatchObject({ state: "failed" });
  });
});

describe("forceRemoveStack and recheckStack", () => {
  it("force remove is gone once the containers are removed", async () => {
    world.listed = true;
    expect((await forceRemoveStack(stack)).outcome).toEqual({ state: "gone", warning: null });
  });

  it("force remove reports the error when the removal fails and containers remain", async () => {
    world.listed = true;
    world.left = true;
    world.rmFails = true;
    expect((await forceRemoveStack(stack)).outcome).toMatchObject({ state: "remaining", error: expect.stringMatching(/rm failed/) });
  });

  it("recheck reports what is left", async () => {
    world.left = true;
    expect(await recheckStack(stack, "try")).toMatchObject({ state: "remaining" });
  });
});
