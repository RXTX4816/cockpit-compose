import { describe, it, expect } from "vitest";
import { parseDockerBytes, formatBytes } from "./bytes";

describe("parseDockerBytes", () => {
  it("parses bare bytes", () => {
    expect(parseDockerBytes("512B")).toBe(512);
  });

  it("parses kB", () => {
    expect(parseDockerBytes("1kB")).toBe(1000);
  });

  it("parses MB", () => {
    expect(parseDockerBytes("1MB")).toBe(1e6);
  });

  it("parses MiB", () => {
    expect(parseDockerBytes("1MiB")).toBe(1048576);
  });

  it("parses GiB", () => {
    expect(parseDockerBytes("2GiB")).toBeCloseTo(2 * 1073741824);
  });

  it("parses GB", () => {
    expect(parseDockerBytes("1GB")).toBe(1e9);
  });

  it("parses TiB", () => {
    expect(parseDockerBytes("1TiB")).toBe(1099511627776);
  });

  it("parses decimal values", () => {
    expect(parseDockerBytes("1.5MiB")).toBeCloseTo(1.5 * 1048576);
  });

  it("is case insensitive", () => {
    expect(parseDockerBytes("1mib")).toBe(1048576);
  });

  it("returns 0 for empty string", () => {
    expect(parseDockerBytes("")).toBe(0);
  });

  it("handles docker stats mem format (used / limit)", () => {
    // parseDockerBytes only reads the first number+unit; caller splits on " / "
    expect(parseDockerBytes("256MiB")).toBe(256 * 1048576);
  });

  it("returns 0 for non-numeric string", () => {
    expect(parseDockerBytes("N/A")).toBe(0);
  });
});

describe("formatBytes", () => {
  it("shows bytes for values under 1024", () => {
    expect(formatBytes(500)).toBe("500B");
  });

  it("shows KiB for values under 1MiB", () => {
    expect(formatBytes(2048)).toBe("2KiB");
  });

  it("shows MiB with one decimal for values under 1GiB", () => {
    expect(formatBytes(1048576)).toBe("1.0MiB");
  });

  it("shows GiB with two decimals for large values", () => {
    expect(formatBytes(2 * 1073741824)).toBe("2.00GiB");
  });

  it("shows 0B for zero", () => {
    expect(formatBytes(0)).toBe("0B");
  });
});

describe("parseDockerBytes — edge cases", () => {
  it("treats a bare number with no unit as bytes", () => {
    expect(parseDockerBytes("42")).toBe(42);
  });
});
