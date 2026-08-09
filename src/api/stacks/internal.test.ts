import { describe, it, expect, vi } from "vitest";
import { fileFlags, makeFakeProcess } from "./internal";

describe("fileFlags", () => {
  it("returns an empty array for no config files", () => {
    expect(fileFlags([])).toEqual([]);
  });

  it("prefixes each config file with -f", () => {
    expect(fileFlags(["/a/compose.yml"])).toEqual(["-f", "/a/compose.yml"]);
  });

  it("preserves order across multiple config files", () => {
    expect(fileFlags(["/a/compose.yml", "/a/overrides.yml"])).toEqual([
      "-f", "/a/compose.yml", "-f", "/a/overrides.yml",
    ]);
  });
});

describe("makeFakeProcess", () => {
  it("resolves with the work function's return value", async () => {
    const proc = makeFakeProcess(async () => "done");
    await expect(proc).resolves.toBe("done");
  });

  it("rejects when the work function throws", async () => {
    const proc = makeFakeProcess(async () => { throw new Error("boom"); });
    await expect(proc).rejects.toThrow("boom");
  });

  it("delivers the resolved value to stream() subscribers", async () => {
    const cb = vi.fn();
    const proc = makeFakeProcess(async () => "output");
    proc.stream(cb);
    await proc;
    expect(cb).toHaveBeenCalledWith("output");
  });

  it("supports subscribing to stream() after construction but before resolution", async () => {
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const proc = makeFakeProcess(async () => { await gate; return "late"; });
    const cb = vi.fn();
    proc.stream(cb);
    release();
    await proc;
    expect(cb).toHaveBeenCalledWith("late");
  });

  it("close() and input() are no-op stubs that don't throw", () => {
    const proc = makeFakeProcess(async () => "");
    expect(() => proc.close()).not.toThrow();
    expect(() => proc.input()).not.toThrow();
  });
});
