import { describe, it, expect } from "vitest";
import { drainProcess } from "./drainProcess";
import { mockProcess } from "../test/helpers";

describe("drainProcess", () => {
  it("resolves with everything the process streamed", async () => {
    expect(await drainProcess(mockProcess(["a\n", "b\n"]))).toBe("a\nb\n");
  });
  it("rejects with the process's failure", async () => {
    await expect(drainProcess(mockProcess("", "boom"))).rejects.toBeDefined();
  });
});
